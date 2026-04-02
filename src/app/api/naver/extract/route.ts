import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import type { LabelAnalysisResult } from "@/types";

const client = new Anthropic();

function stripHtml(str: string) {
  return str.replace(/<[^>]*>/g, "");
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q) return Response.json({ error: "No query" }, { status: 400 });

  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    return Response.json({ error: "Naver API not configured" }, { status: 500 });
  }

  // 네이버 블로그 검색
  const params = new URLSearchParams({
    query: q.includes("와인") ? q : q + " 와인",
    display: "5",
    sort: "sim",
  });

  const res = await fetch(
    "https://openapi.naver.com/v1/search/blog.json?" + params,
    {
      headers: {
        "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET,
      },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    console.error("[naver/extract] blog API error", res.status);
    return Response.json({ error: "Naver API error" }, { status: 502 });
  }

  const data = await res.json();
  const items: Array<{ title: string; description: string }> = (data.items ?? []).map(
    (item: Record<string, string>) => ({
      title: stripHtml(item.title ?? ""),
      description: stripHtml(item.description ?? ""),
    })
  );

  if (items.length === 0) {
    return Response.json({
      name: q, vintage: null, country: null, region: null,
      grapes: null, producer: null, type: null, alcohol: null,
      raw_text: q, notes: "블로그 검색 결과가 없습니다. 직접 입력해 주세요.",
      confidence: { name: "low" },
    } satisfies LabelAnalysisResult);
  }

  const snippets = items
    .map((it, i) => `[${i + 1}] ${it.title}\n${it.description}`)
    .join("\n\n");

  const schema = {
    name: "와인 이름 또는 null",
    vintage: 2020,
    country: "영어 국가명 또는 null",
    region: "AOC/DOC/지역명 또는 null",
    grapes: ["품종"],
    producer: "와이너리명 또는 null",
    type: "red 또는 white 또는 rose 또는 sparkling 또는 fortified 또는 other 또는 null",
    alcohol: "예: 13.5% 또는 null",
    raw_text: q,
    notes: "추가 정보 (한국어) 또는 null",
    confidence: {
      name: "high 또는 medium 또는 low",
      vintage: "high 또는 medium 또는 low",
      country: "high 또는 medium 또는 low",
      region: "high 또는 medium 또는 low",
      grapes: "high 또는 medium 또는 low",
      producer: "high 또는 medium 또는 low",
      type: "high 또는 medium 또는 low",
    },
  };

  const prompt = [
    `검색어: "${q}"`,
    "",
    "아래는 네이버 블로그 검색 결과입니다:",
    "",
    snippets,
    "",
    "위 내용에서 와인 정보를 추출하여 다음 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요:",
    "",
    JSON.stringify(schema, null, 2),
  ].join("\n");

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content.find((b) => b.type === "text");
  const text = block?.type === "text" ? block.text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return Response.json({
      name: q, vintage: null, country: null, region: null,
      grapes: null, producer: null, type: null, alcohol: null,
      raw_text: q, notes: "정보 추출에 실패했습니다. 직접 입력해 주세요.",
      confidence: {},
    } satisfies LabelAnalysisResult);
  }

  try {
    const result: LabelAnalysisResult = JSON.parse(jsonMatch[0]);
    if (!result.raw_text) result.raw_text = q;
    return Response.json(result);
  } catch {
    return Response.json({ error: "Parse error" }, { status: 500 });
  }
}
