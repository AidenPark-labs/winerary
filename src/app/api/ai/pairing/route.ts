import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const client = new Anthropic();

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { name, type, country, region, grapes, producer } = body;

  const wineDesc = [
    name && `와인명: ${name}`,
    type && `종류: ${type}`,
    country && `생산국: ${country}`,
    region && `지역: ${region}`,
    grapes && `품종: ${Array.isArray(grapes) ? grapes.join(", ") : grapes}`,
    producer && `생산자: ${producer}`,
  ].filter(Boolean).join(", ");

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `다음 와인에 어울리는 음식을 추천해 주세요: ${wineDesc}

JSON 배열로만 응답하세요. 다른 텍스트 없이 JSON만:
[
  { "food": "음식명", "reason": "한 줄 이유" },
  ...
]
5가지 추천.`,
      },
    ],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "[]";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return Response.json({ suggestions: [] });

  const suggestions = JSON.parse(jsonMatch[0]);
  return Response.json({ suggestions });
}
