"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { checkAuth, setPendingAction, consumePendingAction } from "@/lib/auth-guard";
import { Heart } from "lucide-react";
import { CloseIcon } from "@/components/Icons";
import Toast from "@/components/Toast";
import AuthPrompt from "@/components/AuthPrompt";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ShopItem {
  lprice: number | null;
}

interface WishlistItem {
  id: string;
  name_ko: string;
  name_en: string;
  created_at: string;
}

// ─── WineCard ────────────────────────────────────────────────────────────────

function WineCard({ nameKo, nameEn, onSave, onAuthNeeded, priceRange }: {
  nameKo: string;
  nameEn: string;
  onSave: (nameKo: string, nameEn: string) => Promise<void>;
  onAuthNeeded: () => void;
  priceRange?: { min: number; max: number } | null;
}) {
  const [price, setPrice] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "found" | "notfound">("loading");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetch(`/api/naver/shopping?q=${encodeURIComponent(nameKo)}`)
      .then((r) => r.json())
      .then((data) => {
        const items: ShopItem[] = data.items ?? [];
        const priced = items.filter((i) => i.lprice != null).map((i) => i.lprice as number);
        if (priced.length > 0) {
          setPrice(Math.min(...priced));
          setStatus("found");
        } else {
          setStatus("notfound");
        }
      })
      .catch(() => setStatus("notfound"));
  }, [nameKo]);

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

  const vivinoUrl = `https://www.vivino.com/search/wines?q=${encodeURIComponent(nameEn)}`;
  const naverUrl = `https://msearch.shopping.naver.com/search/all?query=${encodeURIComponent(nameKo)}`;

  return (
    <span className="block my-2 p-4 rounded-2xl bg-surface/80 border border-white/5 backdrop-blur-md shadow-lg">
      <strong className="text-white text-sm">{nameKo}</strong>
      <span className="block text-xs text-zinc-500 mt-0.5">{nameEn}</span>
      <span className="block mt-1.5 text-xs">
        {status === "loading" && <span className="text-zinc-500">가격 확인 중…</span>}
        {status === "found" && price && (
          <>
            <span className="text-emerald-400 font-semibold">네이버 최저가 {price.toLocaleString()}원</span>
            {priceRange && (price < priceRange.min || price > priceRange.max) && (
              <span className="block mt-1 text-amber-400">⚠ 요청하신 가격대({(priceRange.min / 10000).toFixed(0)}~{(priceRange.max / 10000).toFixed(0)}만원)와 다를 수 있어요</span>
            )}
          </>
        )}
        {status === "notfound" && <span className="text-zinc-500">네이버 쇼핑 검색결과 없음</span>}
      </span>
      <span className="flex gap-2 mt-2 flex-wrap">
        <a
          href={vivinoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-accent text-xs hover:bg-white/10 transition-colors tracking-wide"
          onClick={(e) => e.stopPropagation()}
        >
          Vivino
        </a>
        <a
          href={naverUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-zinc-300 text-xs hover:bg-white/10 transition-colors tracking-wide"
          onClick={(e) => e.stopPropagation()}
        >
          네이버 최저가
        </a>
        <button
          onClick={handleSave}
          disabled={saving || saved}
          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs transition-all tracking-wide ${
            saved
              ? "bg-accent/20 border border-accent/40 text-accent"
              : "bg-surface border border-white/10 text-zinc-300 hover:bg-white/5"
          }`}
        >
          {saved ? "♥ 추가됨" : saving ? "추가 중…" : "♡ 내 와인에 추가"}
        </button>
      </span>
    </span>
  );
}

// ─── 저장된 와인 목록 ─────────────────────────────────────────────────────────

function WishlistPanel({ items, onDelete, onClose }: {
  items: WishlistItem[];
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col flex-1 overflow-y-auto px-4 pb-4">
      <div className="flex items-center justify-between py-3">
        <h2 className="font-semibold text-zinc-200">저장된 와인 ({items.length})</h2>
        <button onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-300">닫기</button>
      </div>
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 py-16">
          <Heart className="w-12 h-12 text-zinc-700" strokeWidth={1} />
          <p className="text-zinc-500 text-sm font-light mt-1">추천받은 와인을 저장해보세요</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => {
            const vivinoUrl = `https://www.vivino.com/search/wines?q=${encodeURIComponent(item.name_en)}`;
            const naverUrl = `https://msearch.shopping.naver.com/search/all?query=${encodeURIComponent(item.name_ko)}`;
            return (
              <div key={item.id} className="p-3 rounded-2xl bg-surface/80 border border-white/5 backdrop-blur-md">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">{item.name_ko}</p>
                    <p className="text-xs text-zinc-500">{item.name_en}</p>
                  </div>
                  <button
                    onClick={() => onDelete(item.id)}
                    className="text-zinc-500 hover:text-accent flex-shrink-0 transition-colors w-8 h-8 flex items-center justify-center -mt-1 -mr-1 rounded-full hover:bg-white/5"
                  >
                    <CloseIcon size={14} />
                  </button>
                </div>
                <div className="flex gap-2 mt-2">
                  <a href={vivinoUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-accent text-xs tracking-wide">
                    Vivino
                  </a>
                  <a href={naverUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-zinc-300 text-xs tracking-wide">
                    네이버 최저가
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function RecommendPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  const [showWishlist, setShowWishlist] = useState(false);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
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
        setWishlist(wishRes.items ?? []);
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
            body: JSON.stringify({ name_ko: pending.name_ko, name_en: pending.name_en }),
          });
          const data = await res.json();
          if (data.item) setWishlist((prev) => [data.item, ...prev]);
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
      body: JSON.stringify({ name_ko: nameKo, name_en: nameEn }),
    });
    const data = await res.json();
    if (data.item) {
      setWishlist((prev) => [data.item, ...prev]);
    }
    setToast(true);
  }, []);

  async function deleteWine(id: string) {
    await fetch("/api/wishlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setWishlist((prev) => prev.filter((w) => w.id !== id));
  }

  // 대화에서 사용자가 언급한 가격대 추출
  function extractPriceRange(): { min: number; max: number } | null {
    const userMessages = messages.filter((m) => m.role === "user").map((m) => m.content);
    for (let i = userMessages.length - 1; i >= 0; i--) {
      const text = userMessages[i];
      const m1 = text.match(/(\d+)\s*만\s*원\s*대/);
      if (m1) { const v = parseInt(m1[1]) * 10000; return { min: v, max: v + 9999 }; }
      const m2 = text.match(/(\d+)\s*~\s*(\d+)\s*만\s*원/);
      if (m2) return { min: parseInt(m2[1]) * 10000, max: parseInt(m2[2]) * 10000 + 9999 };
      const m3 = text.match(/(\d+)\s*만\s*원\s*이하/);
      if (m3) return { min: 0, max: parseInt(m3[1]) * 10000 };
      const m4 = text.match(/(\d+)\s*만\s*원\s*이상/);
      if (m4) return { min: parseInt(m4[1]) * 10000, max: Infinity };
    }
    return null;
  }

  // 메시지 렌더링: [[한국어|영어]] → WineCard
  function renderMessageContent(content: string) {
    const range = extractPriceRange();
    const parts = content.split(/(\[\[[^\]]+\]\])/g);
    if (parts.length === 1) return content;
    return parts.map((part, i) => {
      const match = part.match(/^\[\[([^|]+)\|([^\]]+)\]\]$/);
      if (!match) return <span key={i}>{part}</span>;
      const [, nameKo, nameEn] = match;
      return <WineCard key={i} nameKo={nameKo.trim()} nameEn={nameEn.trim()} onSave={saveWine} onAuthNeeded={() => setShowAuthPrompt(true)} priceRange={range} />;
    });
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages([...newMessages, { role: "assistant", content: "" }]);
    setInput("");
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
        <button
          onClick={async () => {
            if (!showWishlist && !(await checkAuth())) { setShowAuthPrompt(true); return; }
            setShowWishlist(!showWishlist);
          }}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            showWishlist
              ? "border-rose-700 text-rose-400 bg-rose-950/30"
              : "border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500"
          }`}
        >
          내 와인{wishlist.length > 0 ? ` ${wishlist.length}` : ""}
        </button>
      </header>

      {showWishlist ? (
        <WishlistPanel items={wishlist} onDelete={deleteWine} onClose={() => setShowWishlist(false)} />
      ) : (
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
          <div className="flex-shrink-0 px-4 pt-2 pb-2 bg-background/80 backdrop-blur-md border-t border-white/5">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setTimeout(() => scrollEndRef.current?.scrollIntoView({ behavior: "smooth" }), 300)}
                placeholder="메시지를 입력하세요..."
                rows={1}
                className="flex-1 rounded-[24px] bg-surface/80 border border-white/10 px-5 py-3.5 text-zinc-100 text-sm resize-none focus:outline-none focus:border-accent transition-all font-light shadow-sm"
                style={{ minHeight: "44px" }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || streaming}
                className="w-12 h-12 rounded-full bg-accent hover:bg-accent/90 disabled:opacity-40 flex items-center justify-center text-white transition-all shadow-lg shadow-accent/20 flex-shrink-0 active:scale-[0.98]"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
