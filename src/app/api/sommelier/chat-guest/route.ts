import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "@/lib/sommelier/prompt";

const client = new Anthropic();

export async function POST(request: Request) {
  const { messages } = await request.json();
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "메시지가 필요합니다" }, { status: 400 });
  }

  try {
    // 비로그인: DB 저장 없이 스트리밍만
    const systemPrompt = await buildSystemPrompt(null, messages);

    const stream = await client.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
            }
          }
        } catch { /* stream error */ }
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
    console.error("[sommelier/chat-guest] error:", e);
    return Response.json({ error: "응답 중 오류가 발생했습니다" }, { status: 500 });
  }
}
