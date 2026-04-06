"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { WineSession, SessionEvaluation, SessionComment } from "@/types";
import { Star, Scale, Sparkles, Coins } from "lucide-react";

interface Props {
  session: WineSession;
  initialEvaluations: SessionEvaluation[];
  initialComments: SessionComment[];
  currentUserId: string | null;
  nickname: string;
}

export default function SessionClient({ session, initialEvaluations, initialComments, currentUserId, nickname }: Props) {
  const supabase = createClient();
  const [evaluations, setEvaluations] = useState<SessionEvaluation[]>(initialEvaluations);
  const [comments, setComments] = useState<SessionComment[]>(initialComments);
  const [tab, setTab] = useState<"eval" | "chat">("eval");
  const [commentText, setCommentText] = useState("");
  const [myNickname, setMyNickname] = useState(nickname);
  const [evalForm, setEvalForm] = useState({ balance: 3, complexity: 3, value_score: 3, rating: 3, memo: "" });
  const [submittingEval, setSubmittingEval] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const channel = supabase
      .channel(`session:${session.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "session_evaluations", filter: `session_id=eq.${session.id}` },
        (payload) => setEvaluations((prev) => [...prev, payload.new as SessionEvaluation]))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "session_comments", filter: `session_id=eq.${session.id}` },
        (payload) => setComments((prev) => [...prev, payload.new as SessionComment]))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session.id, supabase]);

  useEffect(() => {
    if (tab === "chat") chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments, tab]);

  async function submitEval() {
    setSubmittingEval(true);
    await supabase.from("session_evaluations").insert({
      session_id: session.id,
      user_id: currentUserId,
      nickname: myNickname,
      ...evalForm,
      memo: evalForm.memo || null,
    });
    setSubmittingEval(false);
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentText.trim()) return;
    setSubmittingComment(true);
    await supabase.from("session_comments").insert({
      session_id: session.id,
      user_id: currentUserId,
      nickname: myNickname,
      content: commentText.trim(),
    });
    setCommentText("");
    setSubmittingComment(false);
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    alert("링크가 복사되었습니다!");
  }

  const avgEval = evaluations.length > 0 ? {
    rating: avg(evaluations, "rating"),
    balance: avg(evaluations, "balance"),
    complexity: avg(evaluations, "complexity"),
    value_score: avg(evaluations, "value_score"),
  } : null;

  return (
    <div className="flex flex-col min-h-dvh">
      {/* Header */}
      <header className="px-5 pt-12 pb-4 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono bg-zinc-800 text-zinc-300 px-2 py-1 rounded-lg">{session.code}</span>
            {session.is_active && <span className="text-xs text-emerald-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />라이브</span>}
          </div>
          <button onClick={copyLink} className="text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 px-3 py-1.5 rounded-lg transition-colors">
            링크 공유
          </button>
        </div>
        <h1 className="text-xl font-bold">{session.title || "와인 세션"}</h1>
        <p className="text-xs text-zinc-500 mt-0.5">{evaluations.length}명 품평 완료</p>
      </header>

      {/* Avg scores */}
      {avgEval && (
        <div className="px-5 py-4 grid grid-cols-4 gap-2">
          {[
            { label: "평점", value: avgEval.rating, icon: Star },
            { label: "밸런스", value: avgEval.balance, icon: Scale },
            { label: "복잡성", value: avgEval.complexity, icon: Sparkles },
            { label: "가성비", value: avgEval.value_score, icon: Coins },
          ].map((item) => (
            <div key={item.label} className="flex flex-col items-center p-3 rounded-2xl bg-surface/80 border border-white/5 backdrop-blur-md shadow-sm gap-1">
              <item.icon className="w-4 h-4 text-accent" />
              <span className="text-lg font-serif text-white">{item.value.toFixed(1)}</span>
              <span className="text-[11px] text-zinc-500 font-light tracking-wide">{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-white/5 px-5">
        {(["eval", "chat"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-all flex-1 text-center ${
              tab === t ? "border-accent text-accent" : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t === "eval" ? `품평 (${evaluations.length})` : `채팅 (${comments.length})`}
          </button>
        ))}
      </div>

      {tab === "eval" && (
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-6">
          {/* Nickname input */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-400 flex-shrink-0 font-light">내 이름:</span>
            <input
              value={myNickname}
              onChange={(e) => setMyNickname(e.target.value)}
              className="flex-1 bg-surface border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-100 font-light focus:outline-none focus:border-accent transition-all"
            />
          </div>

          {/* Eval form */}
          {session.is_active && (
            <div className="flex flex-col gap-5 p-5 rounded-3xl bg-surface/80 border border-white/5 backdrop-blur-md shadow-lg">
              <h3 className="font-semibold text-sm text-white">내 품평 추가</h3>
              {(["rating", "balance", "complexity", "value_score"] as const).map((key) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-400 font-light">{key === "rating" ? "종합 평점" : key === "balance" ? "밸런스" : key === "complexity" ? "복잡성" : "가성비"}</span>
                    <span className="text-accent font-semibold">{evalForm[key].toFixed(key === "rating" ? 1 : 0)}</span>
                  </div>
                  <input
                    type="range"
                    min={key === "rating" ? "0.5" : "1"}
                    max="5"
                    step={key === "rating" ? "0.5" : "1"}
                    value={evalForm[key]}
                    onChange={(e) => setEvalForm((f) => ({ ...f, [key]: parseFloat(e.target.value) }))}
                    className="accent-accent"
                  />
                </div>
              ))}
              <textarea
                value={evalForm.memo}
                onChange={(e) => setEvalForm((f) => ({ ...f, memo: e.target.value }))}
                rows={2}
                placeholder="한 마디 메모 (선택)"
                className="bg-surface border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-100 font-light resize-none focus:outline-none focus:border-accent transition-all"
              />
              <button
                onClick={submitEval}
                disabled={submittingEval}
                className="w-full py-3 rounded-xl bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-medium text-sm transition-all shadow-lg shadow-accent/20 active:scale-[0.98]"
              >
                {submittingEval ? "제출 중…" : "품평 제출"}
              </button>
            </div>
          )}

          {/* Eval list */}
          <div className="flex flex-col gap-3">
            {evaluations.map((ev) => (
              <div key={ev.id} className="p-4 rounded-2xl bg-surface/80 border border-white/5 backdrop-blur-md shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm text-white">{ev.nickname}</span>
                  {ev.rating && <span className="text-amber-400 text-sm font-medium">★ {ev.rating.toFixed(1)}</span>}
                </div>
                <div className="flex gap-3 text-xs text-zinc-400 font-light">
                  {ev.balance && <span>밸런스 {ev.balance}</span>}
                  {ev.complexity && <span>복잡성 {ev.complexity}</span>}
                  {ev.value_score && <span>가성비 {ev.value_score}</span>}
                </div>
                {ev.memo && <p className="text-sm text-zinc-300 mt-2 italic font-light">"{ev.memo}"</p>}
              </div>
            ))}
            {evaluations.length === 0 && <p className="text-center text-zinc-500 text-sm py-4">아직 품평이 없습니다</p>}
          </div>
        </div>
      )}

      {tab === "chat" && (
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2">
            {comments.map((c) => (
              <div key={c.id} className={`flex flex-col gap-0.5 ${c.user_id === currentUserId ? "items-end" : "items-start"}`}>
                <span className="text-xs text-zinc-500 mb-0.5 ml-1 mr-1">{c.nickname}</span>
                <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm shadow-md font-light ${
                  c.user_id === currentUserId
                    ? "bg-accent text-white rounded-br-sm"
                    : "bg-surface/80 border border-white/5 text-zinc-200 rounded-bl-sm backdrop-blur-md"
                }`}>
                  {c.content}
                </div>
              </div>
            ))}
            {comments.length === 0 && <p className="text-center text-zinc-500 text-sm py-4">아직 메시지가 없습니다</p>}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={submitComment} className="px-4 pb-6 pt-3 flex gap-2 border-t border-white/5 bg-background">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="메시지 입력…"
              className="flex-1 bg-surface border border-white/10 rounded-2xl px-4 py-3 text-sm text-zinc-100 font-light focus:outline-none focus:border-accent transition-all shadow-sm"
            />
            <button
              type="submit"
              disabled={submittingComment || !commentText.trim()}
              className="px-5 py-3 rounded-2xl bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-sm font-medium transition-all shadow-lg shadow-accent/20 active:scale-[0.98]"
            >
              전송
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function avg(items: SessionEvaluation[], key: keyof SessionEvaluation): number {
  const vals = items.map((i) => i[key] as number | null).filter((v): v is number => v != null);
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
