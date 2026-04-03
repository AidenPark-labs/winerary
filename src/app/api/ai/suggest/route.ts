import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import type { WineSuggestion } from "@/types";

const client = new Anthropic();

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 2) return Response.json({ wines: [] });

  const prompt = `검색어 "${q}"에 맞는 실제 와인 5~8개를 아래 JSON 배열 형식으로만 응답하세요. 설명 없이 JSON만 출력하세요.

[
  {
    "name": "영어 와인명",
    "name_ko": "한국어 와인명",
    "producer": "생산자",
    "country": "생산국 (한국어, 예: 프랑스)",
    "type": "red 또는 white 또는 rose 또는 sparkling 또는 fortified 또는 other",
    "grapes": "주요 품종 (한국어, 예: 카베르네 소비뇽, 메를로)",
    "vintage_range": "예: 2015-2022",
    "vivino_url": "https://www.vivino.com/search/wines?q=영어+와인명+URL인코딩"
  }
]`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const block = response.content.find((b) => b.type === "text");
    const text = block?.type === "text" ? block.text : "";
    console.log("[ai/suggest] raw:", text.slice(0, 200));

    const jsonMatch =
      text.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/) ||
      text.match(/(\[[\s\S]*\])/);

    if (!jsonMatch) return Response.json({ wines: [] });

    const wines: WineSuggestion[] = JSON.parse(jsonMatch[1] ?? jsonMatch[0]);
    return Response.json({ wines });
  } catch (e) {
    console.error("[ai/suggest] error:", e);
    return Response.json({ wines: [], error: String(e) });
  }
}
