"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

// 와인 카드: 네이버 쇼핑 실제 가격 자동 조회
function WineCard({ nameKo, nameEn }: { nameKo: string; nameEn: string }) {
  const [price, setPrice] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "found" | "notfound">("loading");
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    fetch(`/api/naver/shopping?q=${encodeURIComponent(nameKo)}`)
      .then((r) => r.json())
      .then((data) => {
        const items = data.items ?? [];
        if (items.length > 0) {
          const minPrice = Math.min(...items.filter((i: { lprice: number | null }) => i.lprice).map((i: { lprice: number }) => i.lprice));
          setPrice(minPrice);
          setStatus("found");
        } else {
          setStatus("notfound");
        }
      })
      .catch(() => setStatus("notfound"));
  }, [nameKo]);

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
      <span className="flex gap-2 mt-2">
        <a
          href={vivinoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-950/50 border border-rose-800/50 text-rose-300 text-xs hover:bg-rose-900/50 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          🍇 Vivino
        </a>
        <a
          href={naverUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-950/50 border border-emerald-800/50 text-emerald-300 text-xs hover:bg-emerald-900/50 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          💰 네이버에서 보기
        </a>
      </span>
    </span>
  );
}

// [[한국어 이름|영어 이름]] 패턴을 파싱해서 텍스트와 와인 카드로 분리
function renderMessageContent(content: string) {
  const parts = content.split(/(\[\[[^\]]+\]\])/g);
  if (parts.length === 1) return content;

  return parts.map((part, i) => {
    const match = part.match(/^\[\[([^|]+)\|([^\]]+)\]\]$/);
    if (!match) return <span key={i}>{part}</span>;
    const [, nameKo, nameEn] = match;
    return <WineCard key={i} nameKo={nameKo.trim()} nameEn={nameEn.trim()} />;
  });
}

export default function RecommendPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initRef = useRef(false);

  // 첫 진입 시 AI 인사 메시지
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    startChat([]);
  }, []);

  // 새 메시지 시 스크롤
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

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
    // 첫 메시지가 AI 인사였으면 히스토리에서 초기 프롬프트 제외
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
      {/* 헤더 */}
      <header className="px-5 pt-12 pb-3 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold">와인 추천</h1>
          <p className="text-zinc-500 text-sm mt-0.5">AI 소믈리에에게 추천받으세요</p>
        </div>
        {messages.length > 1 && (
          <button
            onClick={handleNewChat}
            disabled={streaming}
            className="text-xs px-3 py-1.5 rounded-full border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors disabled:opacity-40"
          >
            새 대화
          </button>
        )}
      </header>

      {/* 채팅 영역 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-3">
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
      <div className="flex-shrink-0 px-4 pb-24 pt-2 bg-zinc-950 border-t border-zinc-800">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
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
    </div>
  );
}
