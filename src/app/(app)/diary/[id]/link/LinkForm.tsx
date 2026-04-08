"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { linkRecords, unlinkRecord } from "@/lib/actions/diary";

interface Candidate {
  id: string;
  name: string;
  photos: string[];
  drunk_at: string;
  owner_nickname: string;
  isLinked: boolean;
}

export default function LinkForm({ recordId, candidates }: { recordId: string; candidates: Candidate[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState<Set<string>>(new Set(candidates.filter(c => c.isLinked).map(c => c.id)));

  const filtered = candidates.filter((c) => {
    if (!query) return true;
    return c.name.includes(query) || c.owner_nickname.includes(query);
  });

  async function handleLink(candidateId: string) {
    setLoading(candidateId);
    setError(null);
    const result = await linkRecords(recordId, candidateId);
    setLoading(null);
    if (result.error) {
      setError(result.error);
    } else {
      setLinked((prev) => new Set([...prev, candidateId]));
    }
  }

  async function handleUnlink(candidateId: string) {
    setLoading(candidateId);
    setError(null);
    // 상대방 기록의 연결을 해제하려면 자기 기록을 해제해야 함
    // 여기서는 자기 기록 연결 해제
    const result = await unlinkRecord(recordId);
    setLoading(null);
    if (result.error) {
      setError(result.error);
    } else {
      setLinked(new Set());
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-400 font-light">같은 날짜에 와인을 함께 즐긴 다른 기록을 연결하면, 서로의 평가를 공유할 수 있습니다.</p>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="와인명 또는 닉네임으로 검색"
        className="w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-zinc-100 text-sm font-light focus:outline-none focus:border-violet-500/50 transition-all placeholder:text-zinc-500"
      />

      {error && <p className="text-sm text-red-400">{error}</p>}

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-zinc-500 text-sm font-light">같은 날짜의 다른 기록이 없습니다</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((c) => {
            const isLinked = linked.has(c.id);
            return (
              <div key={c.id} className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${isLinked ? "bg-blue-500/10 border-blue-500/20" : "bg-surface/80 border-white/5"}`}>
                {c.photos[0] ? (
                  <img src={c.photos[0]} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-black/40 border border-white/5 flex items-center justify-center flex-shrink-0">
                    <span className="text-zinc-600 text-lg">🍷</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{c.name}</p>
                  <p className="text-xs text-zinc-500 font-light">{c.owner_nickname}</p>
                </div>
                <button
                  onClick={() => isLinked ? handleUnlink(c.id) : handleLink(c.id)}
                  disabled={loading === c.id}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all disabled:opacity-50 flex-shrink-0 ${
                    isLinked
                      ? "bg-blue-500/15 text-blue-400 border-blue-500/30 hover:bg-red-500/15 hover:text-red-400 hover:border-red-500/30"
                      : "bg-white/5 text-zinc-400 border-white/10 hover:bg-violet-500/15 hover:text-violet-300 hover:border-violet-500/30"
                  }`}
                >
                  {loading === c.id ? "처리 중…" : isLinked ? "연결됨" : "연결"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={() => router.push(`/diary/${recordId}`)}
        className="w-full py-3.5 rounded-2xl text-sm text-white bg-violet-600 hover:bg-violet-500 transition-colors font-medium mt-2"
      >
        완료
      </button>
    </div>
  );
}
