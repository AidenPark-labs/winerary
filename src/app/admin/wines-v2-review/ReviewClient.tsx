"use client";

import { useState, useTransition } from "react";
import { updateWineV2, approveWineV2, type WineV2Patch } from "./actions";

interface Wine {
  id: string;
  name_ko: string;
  name_en: string;
  country_ko: string;
  region_ko: string | null;
  producer: string | null;
  grape_varieties: string[];
  wine_type: string;
  wine_style: string | null;
  alcohol: number | null;
  brand: string | null;
  source: string;
  needs_review: boolean;
  needs_review_reasons: string[] | null;
}

export default function ReviewClient({ initial }: { initial: Wine[] }) {
  const [wines, setWines] = useState(initial);
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<Record<string, Partial<Wine>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});

  if (wines.length === 0) {
    return <p className="text-zinc-400">검수 대상 없음. 모든 변환 정상.</p>;
  }

  const setField = (id: string, key: keyof Wine, value: any) => {
    setEditing((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  };

  const handleSave = (w: Wine) => {
    const patch = editing[w.id];
    if (!patch) return;
    setBusy(w.id);
    startTransition(async () => {
      const cleaned: WineV2Patch = {};
      if (patch.country_ko !== undefined) cleaned.country_ko = patch.country_ko as string;
      if (patch.region_ko !== undefined) cleaned.region_ko = patch.region_ko as string | null;
      if (patch.producer !== undefined) cleaned.producer = patch.producer as string | null;
      if (patch.grape_varieties !== undefined) cleaned.grape_varieties = patch.grape_varieties as string[];
      const r = await updateWineV2(w.id, cleaned);
      if (r.error) {
        setMsg((p) => ({ ...p, [w.id]: `❌ ${r.error}` }));
      } else {
        setMsg((p) => ({ ...p, [w.id]: "✓ 저장" }));
        setWines((prev) => prev.map((x) => (x.id === w.id ? { ...x, ...cleaned } as Wine : x)));
        setEditing((prev) => {
          const next = { ...prev };
          delete next[w.id];
          return next;
        });
      }
      setBusy(null);
    });
  };

  const handleApprove = (w: Wine) => {
    setBusy(w.id);
    startTransition(async () => {
      const r = await approveWineV2(w.id);
      if (r.error) {
        setMsg((p) => ({ ...p, [w.id]: `❌ ${r.error}` }));
      } else {
        setWines((prev) => prev.filter((x) => x.id !== w.id));
      }
      setBusy(null);
    });
  };

  return (
    <div className="space-y-4">
      {wines.map((w) => {
        const cur = { ...w, ...editing[w.id] };
        const isBusy = busy === w.id;
        return (
          <div
            key={w.id}
            className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-3"
          >
            <div className="flex justify-between items-start gap-4">
              <div>
                <div className="text-base font-semibold">{w.name_ko}</div>
                <div className="text-xs text-zinc-500">{w.name_en}</div>
              </div>
              <div className="text-right text-xs text-zinc-500 space-y-1">
                <div>source: {w.source}</div>
                <div>type: {w.wine_type}</div>
              </div>
            </div>

            {w.needs_review_reasons && w.needs_review_reasons.length > 0 && (
              <div className="text-xs text-amber-400">
                <span className="font-medium">사유:</span>{" "}
                {w.needs_review_reasons.join(" · ")}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field
                label="country_ko"
                value={cur.country_ko ?? ""}
                onChange={(v) => setField(w.id, "country_ko", v)}
              />
              <Field
                label="region_ko"
                value={cur.region_ko ?? ""}
                onChange={(v) => setField(w.id, "region_ko", v || null)}
                placeholder="(NULL 가능)"
              />
              <Field
                label="producer"
                value={cur.producer ?? ""}
                onChange={(v) => setField(w.id, "producer", v || null)}
                placeholder="(영문, NULL 가능)"
              />
              <Field
                label="grape_varieties (콤마)"
                value={cur.grape_varieties.join(", ")}
                onChange={(v) =>
                  setField(
                    w.id,
                    "grape_varieties",
                    v.split(",").map((s) => s.trim()).filter(Boolean),
                  )
                }
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                disabled={isBusy || !editing[w.id]}
                onClick={() => handleSave(w)}
                className="px-3 py-1.5 text-xs bg-rose-600 hover:bg-rose-500 disabled:opacity-30 rounded"
              >
                저장
              </button>
              <button
                disabled={isBusy}
                onClick={() => handleApprove(w)}
                className="px-3 py-1.5 text-xs bg-emerald-700 hover:bg-emerald-600 disabled:opacity-30 rounded"
              >
                ✓ 승인 (사유 무시)
              </button>
              {msg[w.id] && (
                <span className="text-xs text-zinc-400 ml-2">{msg[w.id]}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-zinc-500 mb-1">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-100"
      />
    </label>
  );
}
