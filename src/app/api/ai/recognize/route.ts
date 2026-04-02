import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import type { LabelAnalysisResult } from "@/types";

const client = new Anthropic();

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File;
  if (!file) return Response.json({ error: "파일이 없습니다" }, { status: 400 });

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mediaType = (file.type || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "image/gif";

  const message = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1500,
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
            text: `와인 라벨 이미지를 분석하세요. 두 단계로 진행합니다.

**1단계: 라벨에서 보이는 모든 텍스트를 그대로 읽어내세요.**
글씨가 작거나 흐려도 최대한 읽어내세요. 외국어(프랑스어, 이탈리아어, 스페인어, 독일어 등)도 그대로 포함하세요.

**2단계: 읽어낸 텍스트를 바탕으로 아래 JSON을 채우세요.**
와인명을 특정하지 못해도 괜찮습니다. 생산자명, 지역명, 품종 등 부분 정보라도 최대한 채워주세요.

JSON만 반환하세요 (다른 텍스트 없이):
{
  "raw_text": "라벨에서 읽은 모든 텍스트 (줄바꿈 포함, 읽은 그대로)",
  "name": "와인 제품명 또는 null",
  "vintage": 연도 숫자 또는 null,
  "country": "생산국 (예: France, Italy, Spain) 또는 null",
  "region": "지역/AOC/DOC 또는 null",
  "grapes": ["품종1", "품종2"] 또는 null,
  "producer": "생산자/샤토/와이너리 이름 또는 null",
  "type": "red|white|rose|sparkling|fortified|other 또는 null",
  "alcohol": "알코올 도수 문자열 (예: 13.5%) 또는 null",
  "confidence": {
    "name": "high|medium|low",
    "vintage": "high|medium|low",
    "country": "high|medium|low",
    "region": "high|medium|low",
    "grapes": "high|medium|low",
    "producer": "high|medium|low",
    "type": "high|medium|low"
  },
  "notes": "분석 과정에서 발견한 추가 정보나 불확실한 부분 설명 (한국어로)"
}

**판단 기준:**
- 라벨에 명확히 적혀 있으면 → high
- 추론이 필요하면 → medium
- 거의 추측에 가까우면 → low
- 와인명을 알 수 없어도, 라벨에 지역명이나 생산자명이 있으면 반드시 채우세요
- 레이블에 "Mis en bouteille au château" 같은 문구가 있으면 샤토 병입임을 참고하세요`,
          },
        ],
      },
    ],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return Response.json({ error: "AI 분석 결과를 파싱할 수 없습니다" }, { status: 500 });

  try {
    const result: LabelAnalysisResult & { raw_text?: string; alcohol?: string; notes?: string } = JSON.parse(jsonMatch[0]);
    return Response.json(result);
  } catch {
    return Response.json({ error: "AI 응답 형식 오류" }, { status: 500 });
  }
}
