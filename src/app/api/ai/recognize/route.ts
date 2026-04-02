import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import type { LabelAnalysisResult } from "@/types";

const client = new Anthropic();

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File;
  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mediaType = (file.type || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "image/gif";

  const message = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          {
            type: "text",
            text: `이 와인 라벨 이미지를 분석하여 JSON으로만 응답하세요. 다른 텍스트 없이 JSON만 반환하세요.

{
  "name": "와인 이름 (null 가능)",
  "vintage": 숫자 연도 또는 null,
  "country": "생산국 또는 null",
  "region": "지역/AOC 또는 null",
  "grapes": ["품종1", "품종2"] 또는 null,
  "producer": "생산자/와이너리 또는 null",
  "type": "red|white|rose|sparkling|fortified|other 또는 null",
  "confidence": {
    "name": "high|medium|low",
    "vintage": "high|medium|low",
    "country": "high|medium|low",
    "region": "high|medium|low",
    "grapes": "high|medium|low",
    "producer": "high|medium|low",
    "type": "high|medium|low"
  }
}

라벨에서 읽을 수 있는 텍스트를 우선 추출하고, 부족한 경우 라벨 디자인·로고·색상 등 시각적 단서로 추정하세요. 인식 불가 항목은 null로 반환하세요.`,
          },
        ],
      },
    ],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return Response.json({ error: "AI 분석 실패" }, { status: 500 });

  const result: LabelAnalysisResult = JSON.parse(jsonMatch[0]);
  return Response.json(result);
}
