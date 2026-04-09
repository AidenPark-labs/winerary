"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { checkAuth, setPendingAction, consumePendingAction } from "@/lib/auth-guard";
import Link from "next/link";
import Toast from "@/components/Toast";
import AuthPrompt from "@/components/AuthPrompt";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface WishlistItem {
  id: string;
  name_ko: string;
  name_en: string;
  created_at: string;
}

// ─── WineCard ────────────────────────────────────────────────────────────────

interface WineInfo {
  id: string;
  naver_image: string | null;
  price: number | null;
  wine_type: string | null;
  country: string | null;
  grape_variety: string | null;
  vivino_rating: number | null;
}

const WINE_TYPE_KO: Record<string, string> = {
  red: "레드", white: "화이트", rose: "로제",
  sparkling: "스파클링", fortified: "주정강화", dessert: "디저트", other: "기타",
};

function WineCard({ nameKo, nameEn, onSave, onAuthNeeded, alreadySaved }: {
  nameKo: string;
  nameEn: string;
  onSave: (nameKo: string, nameEn: string) => Promise<void>;
  onAuthNeeded: () => void;
  alreadySaved?: boolean;
}) {
  const [saved, setSaved] = useState(alreadySaved ?? false);
  const [saving, setSaving] = useState(false);
  const [wine, setWine] = useState<WineInfo | null>(null);
  const fetchedRef = useRef(false);

  // wines DB에서 와인 정보 매칭
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetch(`/api/wines/search?q=${encodeURIComponent(nameEn)}&limit=1`)
      .then((r) => r.json())
      .then((data) => {
        const wines = data.wines ?? [];
        if (wines.length > 0) setWine(wines[0]);
      })
      .catch(() => {});
  }, [nameEn]);

  async function handleSave() {
    if (saved || saving) return;
    if (!(await checkAuth())) {
      setPendingAction({ type: "wishlist_add", name_ko: nameKo, name_en: nameEn });
      onAuthNeeded();
      return;
    }
    setSaving(true);
    await onSave(nameKo, nameEn);
    setSaved(true);
    setSaving(false);
  }

  const wineType = wine?.wine_type ? WINE_TYPE_KO[wine.wine_type] ?? wine.wine_type : null;
  const meta = [wineType, wine?.country, wine?.grape_variety].filter(Boolean).join(" · ");

  return (
    <span className="block my-2 rounded-2xl overflow-hidden" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 100%)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)", backdropFilter: "blur(20px)" }}>
      <span className="flex items-center gap-3 px-3 pt-3">
        {wine?.naver_image ? (
          <span className="flex-shrink-0 w-12 h-12 rounded-xl overflow-hidden">
            <img src={wine.naver_image} alt={nameKo} className="w-full h-full object-cover" />
          </span>
        ) : (
          <span className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-zinc-600 text-base" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
            🍷
          </span>
        )}
        <span className="flex-1 min-w-0">
          <strong className="text-white text-[13px] font-semibold leading-tight line-clamp-2">{nameKo}</strong>
          <span className="block text-[11px] text-zinc-500 mt-0.5 truncate">{nameEn}</span>
        </span>
      </span>
      <span className="flex flex-col gap-0.5 px-3 mt-1.5">
        {meta && <span className="text-[11px] text-zinc-400/70">{meta}</span>}
        <span className="flex items-center gap-2.5">
          {wine?.price && (
            <span className="text-[12px] text-emerald-400/90 font-semibold">
              {wine.price.toLocaleString()}원
            </span>
          )}
          {wine?.vivino_rating && (
            <span className="text-[11px] text-rose-400 font-medium">
              ★ {wine.vivino_rating.toFixed(1)}
            </span>
          )}
        </span>
      </span>
      <span className="flex gap-2 px-3 pt-2.5 pb-3">
        {wine?.id && (
          <a
            href={`/wines/${wine.id}`}
            className="flex-1 inline-flex items-center justify-center h-9 rounded-xl text-zinc-300 text-xs transition-all"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            onClick={(e) => e.stopPropagation()}
          >
            자세히
          </a>
        )}
        <button
          onClick={handleSave}
          disabled={saving || saved}
          className={`flex-1 inline-flex items-center justify-center h-9 rounded-xl text-xs transition-all ${
            saved ? "text-rose-400" : "text-zinc-300"
          }`}
          style={saved
            ? { background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.25)" }
            : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }
          }
        >
          {saved ? "♥ 추가됨" : saving ? "저장 중…" : "♡ 저장"}
        </button>
      </span>
    </span>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function RecommendPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  const [savedNames, setSavedNames] = useState<Set<string>>(new Set());
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [toast, setToast] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 초기화: 인증 확인 + 데이터 로드
  useEffect(() => {
    async function init() {
      const authed = await checkAuth();
      setIsAuthed(authed);

      if (authed) {
        // 위시리스트 + 이전 대화 병렬 로드
        const [wishRes, msgRes] = await Promise.all([
          fetch("/api/wishlist").then((r) => r.json()).catch(() => ({ items: [] })),
          fetch("/api/sommelier/messages").then((r) => r.json()).catch(() => ({ messages: [] })),
        ]);
        const wishItems = wishRes.items ?? [];
        setSavedNames(new Set(wishItems.map((w: WishlistItem) => w.name_en)));
        const loaded: Message[] = (msgRes.messages ?? []).map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));
        if (loaded.length > 0) {
          setMessages(loaded);
        } else {
          // 첫 대화: AI 인사
          await sendGreeting(true);
        }

        // 대기 액션 처리
        const pending = consumePendingAction();
        if (pending?.type === "wishlist_add") {
          const res = await fetch("/api/wishlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name_ko: pending.name_ko, name_en: pending.name_en, source: "ai" }),
          });
          const data = await res.json();
          if (data.item) setSavedNames((prev) => new Set(prev).add(pending.name_en));
          setToast(true);
        }
      } else {
        // 비로그인: AI 인사
        await sendGreeting(false);
      }
      setLoading(false);
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 스크롤 자동 하단
  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // AI 인사 메시지
  async function sendGreeting(authed: boolean) {
    setStreaming(true);
    setMessages([{ role: "assistant", content: "" }]);

    const greetingMessage = "안녕하세요, 와인이나 음식에 대해 상담받고 싶어요.";
    const endpoint = authed ? "/api/sommelier/chat" : "/api/sommelier/chat-guest";
    const body = authed
      ? { message: greetingMessage }
      : { messages: [{ role: "user", content: greetingMessage }] };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("API error");
      await streamResponse(res);
    } catch {
      setMessages([{ role: "assistant", content: "안녕하세요! 와인과 음식에 대해 무엇이든 물어봐주세요." }]);
    } finally {
      setStreaming(false);
    }
  }

  // SSE 스트리밍 처리 공통 함수
  async function streamResponse(res: Response) {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const data = line.replace(/^data: /, "");
        if (data === "[DONE]") break;
        try {
          const { text } = JSON.parse(data);
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === "assistant") {
              updated[updated.length - 1] = { ...last, content: last.content + text };
            }
            return updated;
          });
        } catch { /* skip malformed */ }
      }
    }
  }

  const saveWine = useCallback(async (nameKo: string, nameEn: string) => {
    const res = await fetch("/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name_ko: nameKo, name_en: nameEn, source: "ai" }),
    });
    await res.json();
    setSavedNames((prev) => new Set(prev).add(nameEn));
    setToast(true);
  }, []);

  // 메시지 렌더링: [[추천카드]], ((인라인멘션)), **볼드**
  function renderMessageContent(content: string) {
    const parts = content.split(/(\[\[[^\]]+\]\]|\(\([^)]+\)\)|\*\*[\s\S]*?\*\*)/g);
    return parts.map((part, i) => {
      // 추천 카드: [[한국어|영어]]
      const cardMatch = part.match(/^\[\[([^|]+)\|([^\]]+)\]\]$/);
      if (cardMatch) {
        const [, nameKo, nameEn] = cardMatch;
        return <WineCard key={i} nameKo={nameKo.trim()} nameEn={nameEn.trim()} onSave={saveWine} onAuthNeeded={() => setShowAuthPrompt(true)} alreadySaved={savedNames.has(nameEn.trim())} />;
      }
      // 인라인 멘션: ((한국어|영어))
      const mentionMatch = part.match(/^\(\(([^|]+)\|([^)]+)\)\)$/);
      if (mentionMatch) {
        return <span key={i} className="text-accent font-medium">{mentionMatch[1].trim()}</span>;
      }
      // 볼드: **텍스트**
      const boldMatch = part.match(/^\*\*([\s\S]*?)\*\*$/);
      if (boldMatch) {
        return <strong key={i} className="text-accent font-semibold">{boldMatch[1]}</strong>;
      }
      // 남은 ** 제거
      if (part.includes("**")) {
        return <span key={i}>{part.replace(/\*\*/g, "")}</span>;
      }
      return <span key={i}>{part}</span>;
    });
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages([...newMessages, { role: "assistant", content: "" }]);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setStreaming(true);

    try {
      const endpoint = isAuthed ? "/api/sommelier/chat" : "/api/sommelier/chat-guest";
      const body = isAuthed
        ? { message: text }
        : { messages: newMessages.map((m) => ({ role: m.role, content: m.content })) };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("API error");
      await streamResponse(res);
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant" && !last.content) {
          updated[updated.length - 1] = { ...last, content: "죄송합니다, 오류가 발생했어요. 다시 시도해주세요." };
        }
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3" style={{ height: "calc(100dvh - 5rem)" }}>
        <span className="inline-flex gap-1">
          <span className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "300ms" }} />
        </span>
        <p className="text-zinc-500 text-sm">소믈리에를 준비하고 있어요...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100dvh - 5rem)" }}>
      {showAuthPrompt && <AuthPrompt message="와인을 저장하려면 로그인이 필요합니다" returnUrl="/recommend" />}
      <Toast message="내 와인에 추가되었어요!" visible={toast} onHide={() => setToast(false)} />

      {/* 헤더 */}
      <header className="px-5 pt-8 pb-2 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white">와인 소믈리에</h1>
          <p className="text-zinc-500 text-sm mt-0.5">와인과 음식, 무엇이든 물어보세요</p>
        </div>
        <Link
          href="/profile/wishlist"
          className="text-xs px-3 py-1.5 rounded-full border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
        >
          내 와인
        </Link>
      </header>

      <>
          {/* 채팅 영역 */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 flex flex-col gap-3">
            <div className="flex-1" />
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-[24px] px-5 py-3.5 text-sm leading-relaxed whitespace-pre-wrap shadow-lg ${
                    msg.role === "user"
                      ? "bg-accent text-white rounded-br-md font-light"
                      : "bg-surface/80 border border-white/5 text-zinc-200 rounded-bl-md font-light backdrop-blur-md"
                  }`}
                >
                  {msg.content
                    ? (msg.role === "assistant" ? renderMessageContent(msg.content) : msg.content)
                    : (
                      <span className="inline-flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </span>
                    )
                  }
                </div>
              </div>
            ))}
            <div ref={scrollEndRef} />
          </div>

          {/* 입력 영역 */}
          <div className="flex-shrink-0 px-3 pt-1.5 pb-1 bg-background/80 backdrop-blur-md border-t border-white/5">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  // auto-grow
                  const ta = e.target;
                  ta.style.height = "auto";
                  ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => setTimeout(() => scrollEndRef.current?.scrollIntoView({ behavior: "smooth" }), 300)}
                placeholder="메시지를 입력하세요..."
                rows={1}
                className="flex-1 rounded-[20px] bg-surface/80 border border-white/10 px-4 py-3 text-zinc-100 text-sm resize-none focus:outline-none focus:border-accent transition-all font-light shadow-sm"
                style={{ minHeight: "44px", maxHeight: "120px" }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || streaming}
                className="w-11 h-11 rounded-full bg-accent hover:bg-accent/90 disabled:opacity-40 flex items-center justify-center text-white transition-all shadow-lg shadow-accent/20 flex-shrink-0 active:scale-[0.98] mb-[1px]"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
        </>
    </div>
  );
}
