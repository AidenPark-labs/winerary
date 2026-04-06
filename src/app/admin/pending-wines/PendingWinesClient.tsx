"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PendingWine {
  id: string;
  name_ko: string;
  name_en: string | null;
  wine_type: string | null;
  country: string | null;
  grape_variety: string | null;
  producer: string | null;
  record_count: number;
  status: string;
  created_at: string;
  profiles: { nickname: string } | null;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: "대기", cls: "bg-amber-900/50 text-amber-400" },
  promoted: { label: "편입됨", cls: "bg-emerald-900/50 text-emerald-400" },
  rejected: { label: "거부됨", cls: "bg-zinc-800 text-zinc-500" },
};

export default function PendingWinesClient({ wines }: { wines: PendingWine[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "promoted" | "rejected">("pending");

  const filtered = filter === "all" ? wines : wines.filter((w) => w.status === filter);

  async function handleAction(id: string, action: "promote" | "reject") {
    setLoading(id);
    try {
      const res = await fetch("/api/admin/pending-wines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "오류가 발생했습니다");
      }
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      {/* 필터 */}
      <div className="flex gap-2 mb-4">
        {(["pending", "promoted", "rejected", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === f ? "bg-rose-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            {f === "all" ? "전체" : STATUS_BADGE[f].label} ({f === "all" ? wines.length : wines.filter((w) => w.status === f).length})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-zinc-500 text-sm py-8 text-center">해당 상태의 와인이 없습니다</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-left">
                <th className="py-2 pr-3">와인명</th>
                <th className="py-2 pr-3">영문명</th>
                <th className="py-2 pr-3">종류</th>
                <th className="py-2 pr-3">국가</th>
                <th className="py-2 pr-3">기록 수</th>
                <th className="py-2 pr-3">제출자</th>
                <th className="py-2 pr-3">상태</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((w) => {
                const badge = STATUS_BADGE[w.status] ?? STATUS_BADGE.pending;
                return (
                  <tr key={w.id} className="border-b border-zinc-800/50">
                    <td className="py-2 pr-3 font-medium max-w-[200px] truncate">{w.name_ko}</td>
                    <td className="py-2 pr-3 text-zinc-400 max-w-[180px] truncate">{w.name_en || "-"}</td>
                    <td className="py-2 pr-3">{w.wine_type || "-"}</td>
                    <td className="py-2 pr-3">{w.country || "-"}</td>
                    <td className="py-2 pr-3">
                      <span className={`font-semibold ${w.record_count >= 3 ? "text-amber-400" : "text-zinc-300"}`}>
                        {w.record_count}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-zinc-500">{w.profiles?.nickname || "-"}</td>
                    <td className="py-2 pr-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${badge.cls}`}>{badge.label}</span>
                    </td>
                    <td className="py-2">
                      {w.status === "pending" && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAction(w.id, "promote")}
                            disabled={loading === w.id}
                            className="px-2.5 py-1 rounded bg-emerald-700 text-white text-xs hover:bg-emerald-600 disabled:opacity-50"
                          >
                            승인
                          </button>
                          <button
                            onClick={() => handleAction(w.id, "reject")}
                            disabled={loading === w.id}
                            className="px-2.5 py-1 rounded bg-zinc-700 text-zinc-300 text-xs hover:bg-zinc-600 disabled:opacity-50"
                          >
                            거부
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
