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

  const exampleItem: WineSuggestion = {
    name: "Château Margaux",
    name_ko: "샤또 마고",
    producer: "Château Margaux",
    country: "France",
    type: "red",
    vintage_range: "2010-2020",
    vivino_url: "https://www.vivino.com/search/wines?q=Ch%C3%A2teau+Margaux",
  };

  const prompt = [
    `사용자가 "${q}"(으)로 와인을 검색했습니다.`,
    "",
    "이 검색어에 맞는 실제 존재하는 와인 목록 5~8개를 JSON 배열로만 응답하세요. 다른 텍스트는 포함하지 마세요.",
    "vivino_url은 https://www.vivino.com/search/wines?q= 뒤에 영어 와인명+생산자를 URL 인코딩하여 붙이세요.",
    "",
    "형식:",
    JSON.stringify([exampleItem], null, 2),
  ].join("\n");

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const block = response.content.find((b) => b.type === "text");
    const text = block?.type === "text" ? block.text : "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return Response.json({ wines: [] });

    const wines: WineSuggestion[] = JSON.parse(jsonMatch[0]);
    return Response.json({ wines });
  } catch (e) {
    console.error("[ai/suggest]", e);
    return Response.json({ wines: [], error: "AI 오류" });
  }
}
