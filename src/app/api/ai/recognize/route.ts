import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import type { LabelAnalysisResult } from "@/types";

const client = new Anthropic();

const SUFFIX = "Search the web for this wine. Return ONLY a JSON object — no other text.";

async function searchAndStructure(rawText: string): Promise<string> {
  const schema = {
    name: "wine name or null",
    vintage: 0,
    country: "English country name or null",
    region: "AOC/DOC/region or null",
    grapes: ["variety"],
    producer: "winery name or null",
    type: "red|white|rose|sparkling|fortified|other or null",
    alcohol: "e.g. 13.5% or null",
    raw_text: rawText.slice(0, 300),
    confidence: { name: "high|medium|low", vintage: "high|medium|low", country: "high|medium|low", region: "high|medium|low", grapes: "high|medium|low", producer: "high|medium|low", type: "high|medium|low" },
    notes: "extra info in Korean or null",
  };

  const prompt = "Wine label text:\n\n" + rawText + "\n\n" + SUFFIX + "\n\nReturn this JSON structure:\n" + JSON.stringify(schema);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];

  let response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 2048,
    tools: [{ type: "web_search_20250305", name: "web_search" } as unknown as Anthropic.Messages.Tool],
    messages,
  });

  let i = 0;
  while (response.stop_reason === "tool_use" && i++ < 5) {
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: "Return the final JSON now." });
    response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 2048,
      tools: [{ type: "web_search_20250305", name: "web_search" } as unknown as Anthropic.Messages.Tool],
      messages,
    });
  }

  const block = response.content.find((b) => b.type === "text");
  return block?.type === "text" ? block.text : "";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // text 필드로 OCR 텍스트 받음 (이미지 직접 분석 제거)
  const body = await request.json().catch(() => null);
  const rawText: string = body?.text ?? "";
  if (!rawText.trim()) return Response.json({ error: "No text provided" }, { status: 400 });

  const synthesized = await searchAndStructure(rawText);
  const jsonMatch = synthesized.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return Response.json({
      name: null, vintage: null, country: null, region: null,
      grapes: null, producer: null, type: null, alcohol: null,
      raw_text: rawText, notes: "웹 검색 결과를 파싱하지 못했습니다. 라벨 텍스트를 참고해 직접 입력해 주세요.",
      confidence: {},
    } satisfies LabelAnalysisResult);
  }

  try {
    const result: LabelAnalysisResult = JSON.parse(jsonMatch[0]);
    if (!result.raw_text) result.raw_text = rawText;
    return Response.json(result);
  } catch {
    return Response.json({ error: "Parse error" }, { status: 500 });
  }
}
