import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function POST(request: Request) {
  const { query } = await request.json();
  if (!query || typeof query !== "string" || query.trim().length < 2) {
    return Response.json({ error: "검색어가 필요합니다" }, { status: 400 });
  }

  const prompt = `"${query}"라는 와인을 찾아주세요.
정확한 이름이 아닐 수 있습니다. 발음이 비슷하거나 철자가 유사한 와인이 있다면 그 와인의 정보를 알려주세요.
예: "gricmon" → "Manoir Grignon", "몬테스알파" → "Montes Alpha"

해당하는 와인을 전혀 추정할 수 없으면 {"error": "해당 와인을 찾을 수 없습니다"} 만 반환하세요.

아래 JSON 형식으로만 응답하세요. 설명 없이 JSON만 출력하세요:
{
  "name": "와인 한국어 이름",
  "name_original": "영어/원본 와인명",
  "producer": "생산자 또는 와이너리",
  "country": "생산 국가 (한국어)",
  "region": "생산 지역 (없으면 null)",
  "wine_type": "red/white/rose/sparkling/fortified/other 중 하나",
  "grape_variety": "포도 품종 (한국어, 모르면 null)",
  "vintage": null,
  "vivino_url": "https://www.vivino.com/search/wines?q=URL인코딩된원본와인명",
  "description": "이 와인의 특징을 2~3문장으로 설명 (확실한 정보만)",
  "food_pairing": "어울리는 음식 3~4가지"
}`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const block = response.content.find((b) => b.type === "text");
    const text = block?.type === "text" ? block.text : "";

    const jsonMatch =
      text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ||
      text.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) return Response.json({ error: "와인을 찾을 수 없습니다" });

    return Response.json(JSON.parse(jsonMatch[1] ?? jsonMatch[0]));
  } catch {
    return Response.json({ error: "검색 중 오류가 발생했습니다" });
  }
}
