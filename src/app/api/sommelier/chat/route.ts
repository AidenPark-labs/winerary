import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { loadContext, loadRecentMessages, checkAndSummarize } from "@/lib/sommelier/context";
import { buildSystemPrompt } from "@/lib/sommelier/prompt";

const client = new Anthropic();

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { message } = await request.json();
  if (!message || typeof message !== "string") {
    return Response.json({ error: "메시지가 필요합니다" }, { status: 400 });
  }

  try {
    // 1. 사용자 메시지 저장
    await supabase
      .from("sommelier_messages")
      .insert({ user_id: user.id, role: "user", content: message });

    // 2. 컨텍스트 + 최근 메시지 로드
    const [context, recentMessages] = await Promise.all([
      loadContext(user.id),
      loadRecentMessages(user.id),
    ]);

    // 3. 시스템 프롬프트 조립
    const systemPrompt = await buildSystemPrompt(user.id, recentMessages, context);

    // 4. Claude 스트리밍 호출
    const claudeMessages = recentMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const stream = await client.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: claudeMessages,
    });

    // 5. SSE 스트리밍 응답
    let fullResponse = "";
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              fullResponse += event.delta.text;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }

        // 6. assistant 응답 저장 (스트림 종료 후)
        if (fullResponse) {
          await supabase
            .from("sommelier_messages")
            .insert({ user_id: user.id, role: "assistant", content: fullResponse });
        }

        // 7. 요약 필요 여부 체크 + 비동기 실행
        checkAndSummarize(user.id).catch((e) =>
          console.error("[sommelier/chat] summarize error:", e)
        );
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
    console.error("[sommelier/chat] error:", e);
    return Response.json({ error: "응답 중 오류가 발생했습니다" }, { status: 500 });
  }
}
