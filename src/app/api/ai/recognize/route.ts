import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import type { LabelAnalysisResult } from "@/types";

const client = new Anthropic();

const EXTRACT_PROMPT = [
  "Read every piece of text visible on this wine label exactly as written.",
  "Include small print, importer info, alcohol content, volume, and any text near barcodes.",
  "Do NOT translate — return all text in its original language.",
  "Return only the raw text, nothing else.",
].join(" ");

const SEARCH_PROMPT_SUFFIX = [
  "Search the web for this wine and return ONLY a JSON object — no other text.",
  "confidence guide: web-confirmed=high, read-from-label=medium, inferred=low",
].join(" ");

type MediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

/** 1단계: 이미지에서 라벨 텍스트 추출 */
async function extractLabelText(base64: string, mediaType: MediaType): Promise<string> {
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 600,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: EXTRACT_PROMPT },
        ],
      },
    ],
  });
  const block = response.content.find((b) => b.type === "text");
  return block?.type === "text" ? block.text : "";
}

/** 2단계: 추출된 텍스트로 웹 검색 후 와인 정보 구조화 */
async function searchAndStructure(rawText: string): Promise<string> {
  const jsonSchema = JSON.stringify({
    name: "wine name or null",
    vintage: "year number or null",
    country: "producing country (English) or null",
    region: "region/AOC/DOC or null",
    grapes: ["variety1"] ,
    producer: "winery or null",
    type: "red|white|rose|sparkling|fortified|other or null",
    alcohol: "alcohol % string or null",
    raw_text: rawText.slice(0, 300),
    confidence: { name: "high|medium|low", vintage: "high|medium|low", country: "high|medium|low", region: "high|medium|low", grapes: "high|medium|low", producer: "high|medium|low", type: "high|medium|low" },
    notes: "additional info in Korean or null",
  });

  const prompt = "Wine label text:\n\n" + rawText + "\n\n" + SEARCH_PROMPT_SUFFIX + "\n\nReturn this exact JSON structure:\n" + jsonSchema;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];

  let response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 2048,
    tools: [{ type: "web_search_20250305", name: "web_search" } as unknown as Anthropic.Messages.Tool],
    messages,
  });

  // 서버사이드 툴 루프: 검색 결과가 응답에 포함되고 stop_reason이 tool_use이면 계속 진행
  let iterations = 0;
  while (response.stop_reason === "tool_use" && iterations < 5) {
    iterations++;
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: "검색 결과를 바탕으로 요청한 JSON을 반환해주세요. JSON만 반환하세요." });

    response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 2048,
      tools: [{ type: "web_search_20250305", name: "web_search" } as unknown as Anthropic.Messages.Tool],
      messages,
    });
  }

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.type === "text" ? textBlock.text : "";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File;
  if (!file) return Response.json({ error: "파일이 없습니다" }, { status: 400 });

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const rawType = file.type || "image/jpeg";
  const mediaType: MediaType = (["image/jpeg", "image/png", "image/webp", "image/gif"] as MediaType[]).includes(rawType as MediaType)
    ? (rawType as MediaType)
    : "image/jpeg";

  // 1단계: 이미지 텍스트 추출
  const rawText = await extractLabelText(base64, mediaType);

  if (!rawText.trim()) {
    return Response.json({ error: "라벨 텍스트를 읽을 수 없습니다" }, { status: 422 });
  }

  // 2단계: 웹 검색으로 와인 정보 확정
  const synthesized = await searchAndStructure(rawText);

  const jsonMatch = synthesized.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // 웹 검색 실패 시 텍스트라도 반환
    return Response.json({
      name: null, vintage: null, country: null, region: null,
      grapes: null, producer: null, type: null, alcohol: null,
      raw_text: rawText, notes: "웹 검색 결과를 파싱하지 못했습니다. 아래 라벨 텍스트를 참고해 직접 입력해 주세요.",
      confidence: {},
    } satisfies LabelAnalysisResult);
  }

  try {
    const result: LabelAnalysisResult = JSON.parse(jsonMatch[0]);
    // raw_text가 없으면 1단계 결과로 보완
    if (!result.raw_text) result.raw_text = rawText;
    return Response.json(result);
  } catch {
    return Response.json({ error: "AI 응답 파싱 실패" }, { status: 500 });
  }
}
