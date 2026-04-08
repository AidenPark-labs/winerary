"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { linkRecords } from "@/lib/actions/diary";

interface MyRecord {
  id: string;
  name: string;
  photos: string[];
  drunk_at: string;
  similarity: number;
  recommended: boolean;
}

export default function LinkMineForm({ sharedRecordId, myRecords }: { sharedRecordId: string; myRecords: MyRecord[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleLink(myRecordId: string) {
    setLoading(myRecordId);
    setError(null);
    const result = await linkRecords(myRecordId, sharedRecordId);
    setLoading(null);
    if (result.error) {
      setError(result.error);
    } else {
      router.push(`/diary/${sharedRecordId}`);
      router.refresh();
    }
  }

  if (myRecords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
        <p className="text-zinc-500 text-sm font-light leading-relaxed">같은 날짜의 내 기록이 없습니다.<br/>먼저 와인 기록을 작성해보세요.</p>
        <button onClick={() => router.back()} className="text-sm text-violet-400 hover:text-violet-300">돌아가기</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-400 font-light">같은 날짜의 내 기록 중 연결할 기록을 선택하세요.</p>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex flex-col gap-2">
        {myRecords.map((r) => (
          <div key={r.id} className="flex items-center gap-3 p-3 rounded-2xl bg-surface/80 border border-white/5">
            {r.photos[0] ? (
              <img src={r.photos[0]} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-black/40 border border-white/5 flex items-center justify-center flex-shrink-0">
                <span className="text-zinc-600 text-lg">🍷</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm text-white font-medium truncate">{r.name}</p>
                {r.recommended && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium flex-shrink-0">추천</span>
                )}
              </div>
              <p className="text-xs text-zinc-500 font-light">{r.drunk_at}</p>
            </div>
            <button
              onClick={() => handleLink(r.id)}
              disabled={loading === r.id}
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors disabled:opacity-50 flex-shrink-0"
            >
              {loading === r.id ? "연결 중…" : "연결"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
