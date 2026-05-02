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

  // 정책 안내 박스
  const Policy = () => (
    <div className="rounded border border-zinc-800 bg-zinc-900/40 p-3 mb-4 text-xs text-zinc-400 space-y-1">
      <div className="text-zinc-300 font-medium mb-1">⚠ 입력 규칙 (저장 시 자동 정규화됨)</div>
      <div>• <b>country_ko</b>: 한글 단일 단어 (예: 프랑스, 미국, 이탈리아)</div>
      <div>
        • <b>region_ko</b>: <span className="text-amber-400">와인이 명시한 가장 구체적인 산지 한 단어</span>
        (예: 메독, 캘리포니아, 토스카나).
        country는 따로 country_ko에. path/슬래시/괄호 영문 X
      </div>
      <div>
        • <b>producer</b>: <span className="text-amber-400">단일 영문 와이너리명</span>
        (예: E&J Gallo Winery). 두 와이너리 연결 X, 한국어 X
      </div>
      <div>
        • <b>grape_varieties</b>: 한글 배열, 콤마 구분 (예: 까베르네 소비뇽, 메를로).
        비율 입력 시 자동 분리됨 (예: "Cabernet 60%" → grape_blend로)
      </div>
    </div>
  );

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
      if ("error" in r && r.error) {
        setMsg((p) => ({ ...p, [w.id]: `❌ ${r.error}` }));
      } else if (r.success) {
        // 변환 모듈이 정규화한 값으로 카드 갱신
        const n = r.normalized;
        const updated: Partial<Wine> = {};
        if (n.country_ko !== undefined) updated.country_ko = n.country_ko;
        if (n.region_ko !== undefined) updated.region_ko = n.region_ko;
        if (n.producer !== undefined) updated.producer = n.producer;
        if (n.grape_varieties !== undefined) updated.grape_varieties = n.grape_varieties;

        if (r.new_reasons.length === 0) {
          // 검수 통과 → 목록에서 제거
          setWines((prev) => prev.filter((x) => x.id !== w.id));
        } else {
          // 사유 남음 → 정규화 결과로 갱신, 사유 표시
          setWines((prev) =>
            prev.map((x) =>
              x.id === w.id
                ? ({ ...x, ...updated, needs_review_reasons: r.new_reasons } as Wine)
                : x,
            ),
          );
          setMsg((p) => ({
            ...p,
            [w.id]: `정규화됨 · 잔여 사유: ${r.new_reasons.join(" · ")}`,
          }));
        }
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
      <Policy />
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
                label="country_ko (한글, 필수)"
                value={cur.country_ko ?? ""}
                onChange={(v) => setField(w.id, "country_ko", v)}
                placeholder="예: 프랑스, 미국"
              />
              <Field
                label="region_ko (finest 한 단어)"
                value={cur.region_ko ?? ""}
                onChange={(v) => setField(w.id, "region_ko", v || null)}
                placeholder="예: 메독, 캘리포니아 / 비울 수 있음"
              />
              <Field
                label="producer (단일 영문)"
                value={cur.producer ?? ""}
                onChange={(v) => setField(w.id, "producer", v || null)}
                placeholder="예: E&J Gallo Winery / 비울 수 있음"
              />
              <Field
                label="grape_varieties (한글, 콤마)"
                value={cur.grape_varieties.join(", ")}
                onChange={(v) =>
                  setField(
                    w.id,
                    "grape_varieties",
                    v.split(",").map((s) => s.trim()).filter(Boolean),
                  )
                }
                placeholder="예: 진판델, 까베르네 소비뇽"
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
