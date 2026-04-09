import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const client = new Anthropic();

const RECENT_MESSAGE_LIMIT = 20;
const SUMMARIZE_THRESHOLD = 20;

interface SommelierContext {
  summary: string;
  taste_profile: string;
  last_summarized_at: string | null;
}

// ─── 컨텍스트 로드 ───────────────────────────────────────────────────────────

export async function loadContext(userId: string): Promise<SommelierContext> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sommelier_context")
    .select("summary, taste_profile, last_summarized_at")
    .eq("user_id", userId)
    .single();

  return data ?? { summary: "", taste_profile: "", last_summarized_at: null };
}

// ─── 최근 메시지 로드 (Claude에 보낼 메시지) ─────────────────────────────────

export async function loadRecentMessages(userId: string): Promise<{ role: string; content: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sommelier_messages")
    .select("role, content")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(RECENT_MESSAGE_LIMIT);

  return (data ?? []).reverse();
}

// ─── 요약 필요 여부 체크 + 실행 ──────────────────────────────────────────────

export async function checkAndSummarize(userId: string): Promise<void> {
  const supabase = await createClient();

  // 현재 컨텍스트 로드
  const context = await loadContext(userId);

  // 요약되지 않은 메시지 수 확인
  let query = supabase
    .from("sommelier_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (context.last_summarized_at) {
    query = query.gt("created_at", context.last_summarized_at);
  }

  const { count } = await query;
  if (!count || count <= SUMMARIZE_THRESHOLD) return;

  // 요약 대상 메시지 로드 (최근 20개 제외한 오래된 메시지들)
  // last_summarized_at 이후 ~ 최근 20개 제외
  let msgQuery = supabase
    .from("sommelier_messages")
    .select("role, content, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (context.last_summarized_at) {
    msgQuery = msgQuery.gt("created_at", context.last_summarized_at);
  }

  const { data: allMessages } = await msgQuery;
  if (!allMessages || allMessages.length <= RECENT_MESSAGE_LIMIT) return;

  // 오래된 메시지 = 전체 - 최근 20개
  const toSummarize = allMessages.slice(0, allMessages.length - RECENT_MESSAGE_LIMIT);
  if (toSummarize.length === 0) return;

  const lastMessageTime = toSummarize[toSummarize.length - 1].created_at;

  // AI 요약 생성
  const conversationText = toSummarize
    .map((m) => `${m.role === "user" ? "사용자" : "소믈리에"}: ${m.content}`)
    .join("\n");

  const summarizePrompt = `아래 대화와 기존 정보를 바탕으로 두 가지를 JSON으로 생성해주세요.

1. summary: 대화 내용을 간결하게 요약 (300자 이내). 핵심 질문, 추천 내용, 결정 사항을 포함.
2. taste_profile: 사용자의 와인/음식 취향 프로필 업데이트 (200자 이내). 선호 와인 타입, 품종, 가격대, 좋아하는 음식, 특이사항 등.

기존 요약: ${context.summary || "(없음)"}
기존 취향 프로필: ${context.taste_profile || "(없음)"}

새 대화:
${conversationText}

반드시 아래 JSON 형식으로만 응답하세요:
{"summary": "...", "taste_profile": "..."}`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: summarizePrompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const result = JSON.parse(jsonMatch[0]) as { summary: string; taste_profile: string };

    // UPSERT sommelier_context
    await supabase
      .from("sommelier_context")
      .upsert({
        user_id: userId,
        summary: result.summary,
        taste_profile: result.taste_profile,
        last_summarized_at: lastMessageTime,
        updated_at: new Date().toISOString(),
      });
  } catch (e) {
    console.error("[sommelier/context] summarize error:", e);
  }
}
