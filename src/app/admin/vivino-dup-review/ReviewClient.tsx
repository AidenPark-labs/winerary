"use client";

import { useState, useTransition } from "react";
import { unlinkVivino } from "./actions";

interface WineInfo {
  id: string;
  name_ko: string;
  name_en: string;
  country_ko: string;
  region_ko: string | null;
  producer: string | null;
  source: string;
  image_url: string | null;
}

interface Group {
  vivino_url: string;
  dup_count: number;
  wines: WineInfo[];
}

export default function ReviewClient({ initial }: { initial: Group[] }) {
  const [groups, setGroups] = useState(initial);
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});

  if (groups.length === 0) {
    return <p className="text-zinc-400">중복 그룹 없음.</p>;
  }

  const handleUnlink = (wineId: string, vivinoUrl: string) => {
    if (!confirm("이 와인의 Vivino 매칭을 해제할까요?")) return;
    setBusy(wineId);
    startTransition(async () => {
      const r = await unlinkVivino(wineId);
      if (r.error) {
        setMsg((p) => ({ ...p, [wineId]: `❌ ${r.error}` }));
      } else {
        // 그룹에서 해당 와인 제거
        setGroups((prev) =>
          prev
            .map((g) =>
              g.vivino_url === vivinoUrl
                ? { ...g, wines: g.wines.filter((w) => w.id !== wineId), dup_count: g.dup_count - 1 }
                : g,
            )
            .filter((g) => g.wines.length > 1), // 1개 남으면 더 이상 중복 아님
        );
      }
      setBusy(null);
    });
  };

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div
          key={g.vivino_url}
          className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-3"
        >
          <div className="flex justify-between items-start gap-4">
            <a
              href={g.vivino_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-rose-400 hover:underline break-all"
            >
              {g.vivino_url}
            </a>
            <span className="text-xs px-2 py-1 bg-amber-900/40 text-amber-300 rounded shrink-0">
              {g.dup_count}× 중복
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {g.wines.map((w) => (
              <div
                key={w.id}
                className="border border-zinc-800 rounded p-3 bg-zinc-950 space-y-2"
              >
                <div className="flex gap-3">
                  {w.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={w.image_url}
                      alt={w.name_ko}
                      className="w-12 h-16 object-cover rounded"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{w.name_ko}</div>
                    <div className="text-xs text-zinc-500 truncate">{w.name_en}</div>
                    <div className="text-xs text-zinc-500 mt-1">
                      {w.country_ko}
                      {w.region_ko && ` · ${w.region_ko}`}
                    </div>
                    {w.producer && (
                      <div className="text-xs text-zinc-500 truncate">{w.producer}</div>
                    )}
                    <div className="text-[10px] text-zinc-600 mt-1">source: {w.source}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={busy === w.id}
                    onClick={() => handleUnlink(w.id, g.vivino_url)}
                    className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 rounded"
                  >
                    이 와인 Vivino 해제
                  </button>
                  {msg[w.id] && (
                    <span className="text-xs text-zinc-400">{msg[w.id]}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
