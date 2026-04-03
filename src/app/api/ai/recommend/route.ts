import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const client = new Anthropic();

const SYSTEM_PROMPT = `당신은 친절하고 전문적인 소믈리에입니다. 사용자에게 와인을 추천해주는 것이 역할입니다.

대화 방식:
- 상담하듯 자연스럽게 대화하세요. 한 번에 모든 것을 묻지 말고, 하나씩 물어보세요.
- 첫 인사 후 자연스럽게 어떤 자리인지(식사, 파티, 선물, 혼술 등) 물어보세요.
- 이후 순서대로: 선호하는 와인 색상(레드/화이트/로제/상관없음), 가격대, 준비한 음식이나 안주를 파악하세요.
- 이미 충분한 정보가 모이면 바로 추천해주세요. 불필요하게 질문을 늘리지 마세요.

추천 방식:
- 먼저 어떤 스타일/품종의 와인이 어울리는지 설명하세요 (예: "풀바디의 쉬라즈 계열 레드 와인을 추천드려요")
- 그 다음 한국에서 구하기 쉬운 구체적인 와인 2~4개를 추천하세요
- 각 와인에 대해: 이름, 대략적 가격대, 간단한 특징 (1~2문장)을 알려주세요
- 추천 후 "더 다른 스타일도 궁금하시면 말씀해주세요" 등 추가 대화를 유도하세요

와인 이름 표기 규칙 (반드시 지켜야 함):
- 구체적인 와인을 추천할 때, 와인 이름을 반드시 [[한국어|영어]] 형식으로 감싸세요.
- 예: [[옐로우 테일 쉬라즈|Yellow Tail Shiraz]], [[산타 리타 120 까베르네 소비뇽|Santa Rita 120 Cabernet Sauvignon]]
- ** (별표)나 다른 마크다운 문법을 절대 사용하지 마세요. 오직 [[]] 형식만 사용하세요.
- 형식: [[한국어 와인이름|영어 원본 와인이름]]
- 이 태그 바깥에 와인의 설명이나 가격 정보를 적으세요.

톤:
- 한국어로 대화하세요
- 친근하지만 전문적인 톤을 유지하세요
- 이모지는 적절히 사용하되 과하지 않게
- 답변은 너무 길지 않게, 모바일 채팅에 적합한 길이로
- 마크다운 문법(**, ##, ``` 등)은 절대 사용하지 마세요. 일반 텍스트와 [[]] 태그만 사용하세요.`;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { messages } = await request.json();
  if (!messages || !Array.isArray(messages)) {
    return Response.json({ error: "메시지가 필요합니다" }, { status: 400 });
  }

  try {
    const stream = await client.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    console.error("[ai/recommend] error:", e);
    return Response.json({ error: "추천 중 오류가 발생했습니다" }, { status: 500 });
  }
}
