"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { checkAuth, setPendingAction, consumePendingAction } from "@/lib/auth-guard";
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

function WineCard({ nameKo, nameEn, onSave, onAuthNeeded }: {
  nameKo: string;
  nameEn: string;
  onSave: (nameKo: string, nameEn: string) => Promise<void>;
  onAuthNeeded: () => void;
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
    <span className="block my-2 p-3 rounded-xl bg-zinc-900/80 border border-zinc-700/50">
      <strong className="text-white text-sm">{nameKo}</strong>
      <span className="block text-xs text-zinc-500 mt-0.5">{nameEn}</span>
      <span className="block mt-1.5 text-xs">
        {status === "loading" && <span className="text-zinc-500">가격 확인 중…</span>}
        {status === "found" && price && (
          <span className="text-emerald-400 font-semibold">네이버 최저가 {price.toLocaleString()}원</span>
        )}
        {status === "notfound" && <span className="text-zinc-500">네이버 쇼핑 검색결과 없음</span>}
      </span>
      <span className="flex gap-2 mt-2 flex-wrap">
        <a
          href={vivinoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-950/50 border border-rose-800/50 text-rose-300 text-xs hover:bg-rose-900/50 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          Vivino
        </a>
        <a
          href={naverUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-950/50 border border-emerald-800/50 text-emerald-300 text-xs hover:bg-emerald-900/50 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          네이버 최저가
        </a>
        <button
          onClick={handleSave}
          disabled={saving || saved}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-colors ${
            saved
              ? "bg-rose-700/30 border border-rose-700/50 text-rose-300"
              : "bg-amber-950/50 border border-amber-800/50 text-amber-300 hover:bg-amber-900/50"
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
        <div className="flex flex-col items-center justify-center flex-1 gap-2 py-16">
          <span className="text-4xl">♡</span>
          <p className="text-zinc-500 text-sm">추천받은 와인을 저장해보세요</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => {
            const vivinoUrl = `https://www.vivino.com/search/wines?q=${encodeURIComponent(item.name_en)}`;
            const naverUrl = `https://msearch.shopping.naver.com/search/all?query=${encodeURIComponent(item.name_ko)}`;
            return (
              <div key={item.id} className="p-3 rounded-xl bg-zinc-900 border border-zinc-800">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">{item.name_ko}</p>
                    <p className="text-xs text-zinc-500">{item.name_en}</p>
                  </div>
                  <button
                    onClick={() => onDelete(item.id)}
                    className="text-zinc-600 hover:text-rose-400 text-lg flex-shrink-0"
                  >
                    ♥
                  </button>
                </div>
                <div className="flex gap-2 mt-2">
                  <a href={vivinoUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-950/50 border border-rose-800/50 text-rose-300 text-xs">
                    Vivino
                  </a>
                  <a href={naverUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-950/50 border border-emerald-800/50 text-emerald-300 text-xs">
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
  const [showWishlist, setShowWishlist] = useState(false);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [toast, setToast] = useState(false);
  const [inputBottom, setInputBottom] = useState(80); // BottomNav 높이만큼 기본 오프셋
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const initRef = useRef(false);

  // 모바일 키보드 대응: visualViewport 리사이즈 감지
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function onResize() {
      const vv = window.visualViewport!;
      const keyboardHeight = window.innerHeight - vv.height;
      // 키보드가 올라오면 BottomNav(80px) 대신 키보드 높이만큼 올림
      setInputBottom(keyboardHeight > 0 ? keyboardHeight : 80);
    }
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  // 위시리스트 로드 + 로그인 후 대기 액션 실행
  useEffect(() => {
    async function init() {
      const authed = await checkAuth();
      if (authed) {
        fetch("/api/wishlist").then((r) => r.json()).then((d) => setWishlist(d.items ?? [])).catch(() => {});
      }
      // 대기 액션 처리
      const pending = consumePendingAction();
      if (pending?.type === "wishlist_add" && authed) {
        const res = await fetch("/api/wishlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name_ko: pending.name_ko, name_en: pending.name_en }),
        });
        const data = await res.json();
        if (data.item) setWishlist((prev) => [data.item, ...prev]);
        setToast(true);
      }
    }
    init();
  }, []);

  // 첫 진입 시 AI 인사 메시지
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    startChat([]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, inputBottom]);

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

  // 메시지 렌더링: [[한국어|영어]] → WineCard
  function renderMessageContent(content: string) {
    const parts = content.split(/(\[\[[^\]]+\]\])/g);
    if (parts.length === 1) return content;
    return parts.map((part, i) => {
      const match = part.match(/^\[\[([^|]+)\|([^\]]+)\]\]$/);
      if (!match) return <span key={i}>{part}</span>;
      const [, nameKo, nameEn] = match;
      return <WineCard key={i} nameKo={nameKo.trim()} nameEn={nameEn.trim()} onSave={saveWine} onAuthNeeded={() => setShowAuthPrompt(true)} />;
    });
  }

  async function startChat(chatMessages: Message[]) {
    setStreaming(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/ai/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chatMessages.length === 0
            ? [{ role: "user", content: "안녕하세요, 와인 추천을 받고 싶어요." }]
            : chatMessages,
        }),
      });

      if (!res.ok) throw new Error("API error");

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
          } catch {}
        }
      }
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

  function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    const apiMessages = messages.length > 0 && messages[0].role === "assistant"
      ? [{ role: "user" as const, content: "안녕하세요, 와인 추천을 받고 싶어요." }, ...newMessages]
      : newMessages;

    setMessages(newMessages);
    setInput("");
    startChat(apiMessages);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleNewChat() {
    setMessages([]);
    initRef.current = false;
    setTimeout(() => {
      initRef.current = true;
      startChat([]);
    }, 0);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {showAuthPrompt && <AuthPrompt message="와인을 저장하려면 로그인이 필요합니다" returnUrl="/recommend" />}
      <Toast message="내 와인에 추가되었어요!" visible={toast} onHide={() => setToast(false)} />
      {/* 헤더 */}
      <header className="px-5 pt-12 pb-3 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold">와인 추천</h1>
          <p className="text-zinc-500 text-sm mt-0.5">AI 소믈리에에게 추천받으세요</p>
        </div>
        <div className="flex items-center gap-2">
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
          {!showWishlist && messages.length > 1 && (
            <button
              onClick={handleNewChat}
              disabled={streaming}
              className="text-xs px-3 py-1.5 rounded-full border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors disabled:opacity-40"
            >
              새 대화
            </button>
          )}
        </div>
      </header>

      {showWishlist ? (
        <WishlistPanel items={wishlist} onDelete={deleteWine} onClose={() => setShowWishlist(false)} />
      ) : (
        <>
          {/* 채팅 영역 */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 flex flex-col gap-3" style={{ paddingBottom: `${inputBottom + 60}px` }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-rose-700 text-white rounded-br-md"
                      : "bg-zinc-800 text-zinc-200 rounded-bl-md"
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
          </div>

          {/* 입력 영역 */}
          <div ref={inputRef} className="fixed left-0 right-0 px-4 pt-2 pb-3 bg-zinc-950 border-t border-zinc-800 z-30 transition-[bottom] duration-150" style={{ bottom: `${inputBottom}px` }}>
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="메시지를 입력하세요..."
                rows={1}
                className="flex-1 rounded-2xl bg-zinc-800 border border-zinc-700 px-4 py-3 text-zinc-100 text-sm resize-none focus:outline-none focus:border-rose-600 transition-colors max-h-28"
                style={{ minHeight: "44px" }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || streaming}
                className="w-11 h-11 rounded-full bg-rose-700 hover:bg-rose-600 disabled:opacity-40 flex items-center justify-center text-white transition-colors flex-shrink-0"
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
