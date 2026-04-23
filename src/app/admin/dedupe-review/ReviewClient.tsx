"use client";

import { useState, useTransition, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { confirmDedupe, rejectDedupe, type FinalMergeData } from "./actions";

type MatchReason = "name_ko_variant" | "name_en_variant" | "country_mismatch" | "fuzzy_name";

interface RawWine {
  id: string;
  source: string;
  source_id: string;
  name_ko: string | null;
  name_en: string | null;
  producer_ko: string | null;
  producer_en: string | null;
  country: string | null;
  region: string | null;
  wine_type: string | null;
  grape_variety: string | null;
  grape_varieties?: string[] | null;
  image_url: string | null;
  alcohol?: string | null;
}

interface TargetWine {
  id: string;
  name_ko: string | null;
  name_en: string | null;
  producer_ko: string | null;
  producer_en: string | null;
  country: string | null;
  country_ko: string | null;
  region: string | null;
  region_ko: string | null;
  wine_type: string | null;
  grape_varieties: string[] | null;
  image_url: string | null;
  alcohol: string | null;
}

export interface DedupeCandidate {
  id: string;
  match_reason: MatchReason;
  match_score: number | null;
  match_details: Record<string, unknown> | null;
  status: string;
  created_at: string;
  raw_wine: RawWine | null;
  target_wine: TargetWine | null;
}

interface Props {
  candidates: DedupeCandidate[];
  pendingCount: number;
}

const REASON_LABEL: Record<MatchReason, { label: string; cls: string; desc: string }> = {
  name_ko_variant: { label: "한글 음차 차이", cls: "bg-amber-950 border-amber-800 text-amber-300", desc: "영문명과 국가는 동일, 한글 표기만 차이" },
  name_en_variant: { label: "영문 표기 차이", cls: "bg-sky-950 border-sky-800 text-sky-300", desc: "한글명과 국가는 동일, 영문 표기만 차이" },
  country_mismatch: { label: "국가 불일치", cls: "bg-violet-950 border-violet-800 text-violet-300", desc: "이름은 동일, 국가만 다름" },
  fuzzy_name: { label: "유사 이름", cls: "bg-rose-950 border-rose-800 text-rose-300", desc: "정규화 Levenshtein 거리 ≤ 2" },
};

const WINE_TYPES = ["red", "white", "rose", "sparkling", "fortified", "dessert", "other"];

type FinalDraft = {
  name_ko: string;
  name_en: string;
  country: string;
  country_ko: string;
  region: string;
  region_ko: string;
  wine_type: string;
  producer_ko: string;
  producer_en: string;
  grape_varieties: string; // 쉼표 구분 문자열로 관리, 저장 시 배열 변환
  alcohol: string;
  image_url: string;
};

function emptyDraft(): FinalDraft {
  return {
    name_ko: "", name_en: "", country: "", country_ko: "", region: "", region_ko: "",
    wine_type: "", producer_ko: "", producer_en: "", grape_varieties: "",
    alcohol: "", image_url: "",
  };
}

function rawGrapeText(raw: RawWine | null): string {
  if (!raw) return "";
  if (Array.isArray(raw.grape_varieties) && raw.grape_varieties.length > 0) return raw.grape_varieties.join(", ");
  return raw.grape_variety ?? "";
}
function targetGrapeText(tgt: TargetWine | null): string {
  if (!tgt) return "";
  return Array.isArray(tgt.grape_varieties) ? tgt.grape_varieties.join(", ") : "";
}

function initialDraftFromTarget(raw: RawWine | null, tgt: TargetWine | null): FinalDraft {
  return {
    name_ko: tgt?.name_ko ?? raw?.name_ko ?? "",
    name_en: tgt?.name_en ?? raw?.name_en ?? "",
    country: tgt?.country ?? raw?.country ?? "",
    country_ko: tgt?.country_ko ?? raw?.country ?? "",
    region: tgt?.region ?? raw?.region ?? "",
    region_ko: tgt?.region_ko ?? tgt?.region ?? raw?.region ?? "",
    wine_type: tgt?.wine_type ?? raw?.wine_type ?? "",
    producer_ko: tgt?.producer_ko ?? raw?.producer_ko ?? "",
    producer_en: tgt?.producer_en ?? raw?.producer_en ?? "",
    grape_varieties: targetGrapeText(tgt) || rawGrapeText(raw),
    alcohol: tgt?.alcohol ?? raw?.alcohol ?? "",
    image_url: tgt?.image_url ?? raw?.image_url ?? "",
  };
}

export default function ReviewClient({ candidates, pendingCount }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cursor, setCursor] = useState(0);
  const [sessionConfirmed, setSessionConfirmed] = useState(0);
  const [sessionRejected, setSessionRejected] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mergeDone, setMergeDone] = useState(false);

  const current = candidates[cursor];
  const hasMoreBeyondBatch = pendingCount > candidates.length;
  const raw = current?.raw_wine ?? null;
  const tgt = current?.target_wine ?? null;

  const [draft, setDraft] = useState<FinalDraft>(emptyDraft());

  // 후보 변경 시 draft 초기화 (target 기반)
  useEffect(() => {
    if (current) setDraft(initialDraftFromTarget(raw, tgt));
    setMergeDone(false);
    setError(null);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setField = useCallback(<K extends keyof FinalDraft>(k: K, v: FinalDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
  }, []);

  // 필드별 raw/target에서 가져오기
  const fromRaw = useCallback((k: keyof FinalDraft) => {
    if (!raw) return;
    setDraft((d) => {
      let value: string = "";
      switch (k) {
        case "name_ko": value = raw.name_ko ?? ""; break;
        case "name_en": value = raw.name_en ?? ""; break;
        case "country": value = raw.country ?? ""; break;
        case "country_ko": value = raw.country ?? ""; break;
        case "region": value = raw.region ?? ""; break;
        case "region_ko": value = raw.region ?? ""; break;
        case "wine_type": value = raw.wine_type ?? ""; break;
        case "producer_ko": value = raw.producer_ko ?? ""; break;
        case "producer_en": value = raw.producer_en ?? ""; break;
        case "grape_varieties": value = rawGrapeText(raw); break;
        case "alcohol": value = raw.alcohol ?? ""; break;
        case "image_url": value = raw.image_url ?? ""; break;
      }
      return { ...d, [k]: value };
    });
  }, [raw]);

  const fromTarget = useCallback((k: keyof FinalDraft) => {
    if (!tgt) return;
    setDraft((d) => {
      let value: string = "";
      switch (k) {
        case "name_ko": value = tgt.name_ko ?? ""; break;
        case "name_en": value = tgt.name_en ?? ""; break;
        case "country": value = tgt.country ?? ""; break;
        case "country_ko": value = tgt.country_ko ?? ""; break;
        case "region": value = tgt.region ?? ""; break;
        case "region_ko": value = tgt.region_ko ?? ""; break;
        case "wine_type": value = tgt.wine_type ?? ""; break;
        case "producer_ko": value = tgt.producer_ko ?? ""; break;
        case "producer_en": value = tgt.producer_en ?? ""; break;
        case "grape_varieties": value = targetGrapeText(tgt); break;
        case "alcohol": value = tgt.alcohol ?? ""; break;
        case "image_url": value = tgt.image_url ?? ""; break;
      }
      return { ...d, [k]: value };
    });
  }, [tgt]);

  const bulkFromRaw = useCallback(() => { if (raw) setDraft(initialDraftFromTarget(null, null /* skip */) as FinalDraft); }, [raw]);
  // 위 구현은 부정확. 다시 정의:
  const loadAllFromRaw = useCallback(() => {
    if (!raw) return;
    setDraft({
      name_ko: raw.name_ko ?? "",
      name_en: raw.name_en ?? "",
      country: raw.country ?? "",
      country_ko: raw.country ?? "",
      region: raw.region ?? "",
      region_ko: raw.region ?? "",
      wine_type: raw.wine_type ?? "",
      producer_ko: raw.producer_ko ?? "",
      producer_en: raw.producer_en ?? "",
      grape_varieties: rawGrapeText(raw),
      alcohol: raw.alcohol ?? "",
      image_url: raw.image_url ?? "",
    });
  }, [raw]);
  const loadAllFromTarget = useCallback(() => {
    if (!tgt) return;
    setDraft(initialDraftFromTarget(null, tgt));
  }, [tgt]);

  const advance = useCallback(() => {
    setCursor((c) => c + 1);
  }, []);

  const handleConfirm = useCallback(() => {
    if (!current || isPending) return;
    const finalData: FinalMergeData = {
      name_ko: draft.name_ko,
      name_en: draft.name_en,
      country: draft.country,
      country_ko: draft.country_ko,
      region: draft.region,
      region_ko: draft.region_ko,
      wine_type: draft.wine_type,
      producer_ko: draft.producer_ko,
      producer_en: draft.producer_en,
      grape_varieties: draft.grape_varieties
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      alcohol: draft.alcohol,
      image_url: draft.image_url,
    };
    setError(null);
    startTransition(async () => {
      const result = await confirmDedupe(current.id, finalData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSessionConfirmed((n) => n + 1);
      setMergeDone(true);
      router.refresh();
    });
  }, [current, isPending, draft, router]);

  const handleReject = useCallback(() => {
    if (!current || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await rejectDedupe(current.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSessionRejected((n) => n + 1);
      advance();
    });
  }, [current, isPending, advance]);

  const handleSkip = useCallback(() => {
    if (!current || isPending) return;
    advance();
  }, [current, isPending, advance]);

  const handleLoadNext = useCallback(() => {
    router.refresh();
    setCursor(0);
  }, [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (mergeDone) {
        if (e.key === "n" || e.key === "N" || e.key === "Enter") advance();
        return;
      }
      if (e.key === "m" || e.key === "M") handleConfirm();
      else if (e.key === "d" || e.key === "D") handleReject();
      else if (e.key === "s" || e.key === "S") handleSkip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleConfirm, handleReject, handleSkip, mergeDone, advance]);

  if (!current) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-10 text-center">
        {pendingCount === 0 ? (
          <>
            <div className="text-xl font-bold text-emerald-400 mb-2">검수할 후보가 없습니다</div>
            <div className="text-sm text-zinc-400">이 세션: merge {sessionConfirmed} · 반려 {sessionRejected}</div>
          </>
        ) : hasMoreBeyondBatch ? (
          <>
            <div className="text-xl font-bold mb-2">이 배치 완료</div>
            <div className="text-sm text-zinc-400 mb-6">세션: merge {sessionConfirmed} · 반려 {sessionRejected} / 전체 잔여 {pendingCount}건</div>
            <button onClick={handleLoadNext} className="px-6 py-3 rounded-md bg-rose-500 hover:bg-rose-600 text-white font-bold transition-colors">
              다음 50건 가져오기
            </button>
          </>
        ) : (
          <>
            <div className="text-xl font-bold text-emerald-400 mb-2">이 세션에서 다 처리했습니다</div>
            <button onClick={handleLoadNext} className="mt-4 px-6 py-3 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition-colors">
              새로고침
            </button>
          </>
        )}
      </div>
    );
  }

  const reason = REASON_LABEL[current.match_reason];

  return (
    <div>
      <div className="flex items-center justify-between mb-4 text-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-zinc-300">
            배치 <span className="font-bold text-rose-400">{cursor + 1}</span>
            <span className="text-zinc-500"> / {candidates.length}</span>
          </span>
          <span className="text-zinc-600">·</span>
          <span className="text-zinc-400">
            전체 pending <span className="font-bold text-zinc-200">{Math.max(0, pendingCount - sessionConfirmed - sessionRejected)}</span>건
          </span>
          <span className="text-zinc-600">·</span>
          <span className="text-xs text-zinc-500">세션: merge {sessionConfirmed} / 반려 {sessionRejected}</span>
        </div>
        <div className="text-xs text-zinc-500 flex gap-3 flex-wrap">
          {mergeDone ? (
            <span><kbd className="px-1.5 py-0.5 rounded bg-emerald-900 border border-emerald-700 text-emerald-200">N</kbd> 다음 후보</span>
          ) : (
            <>
              <span><kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">M</kbd> Merge</span>
              <span><kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">D</kbd> 다른 와인</span>
              <span><kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">S</kbd> 건너뜀</span>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-950/50 border border-red-900 text-red-300 text-sm">오류: {error}</div>
      )}

      {mergeDone && (
        <div className="mb-4 p-3 rounded bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-sm flex items-center justify-between">
          <span>✓ 병합 완료. 추가 편집하려면 Merge 재실행, 이대로 넘어가려면 다음 버튼.</span>
          <button onClick={advance} className="px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-medium">
            다음 후보 →
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold border ${reason.cls}`}>{reason.label}</span>
        <span className="text-xs text-zinc-500">{reason.desc}</span>
        {current.match_score != null && (
          <span className="text-xs text-zinc-400 ml-auto">유사도 {(current.match_score * 100).toFixed(1)}%</span>
        )}
      </div>

      <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 transition-opacity ${isPending ? "opacity-50" : ""}`}>
        {/* 좌: RAW_WINES */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold text-zinc-500 tracking-wider flex items-center gap-2">
              <span>RAW_WINES</span>
              {raw && <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-normal text-[11px]">{raw.source}</span>}
            </div>
            <button onClick={loadAllFromRaw} disabled={isPending || mergeDone} className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 disabled:opacity-40">
              전체 →
            </button>
          </div>
          {raw?.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={raw.image_url} alt={raw.name_ko ?? ""} className="w-20 h-28 object-contain bg-zinc-950 rounded mb-2" />
          )}
          <SourceField label="name_ko" value={raw?.name_ko} onSend={() => fromRaw("name_ko")} disabled={mergeDone} />
          <SourceField label="name_en" value={raw?.name_en} onSend={() => fromRaw("name_en")} disabled={mergeDone} />
          <SourceField label="타입" value={raw?.wine_type} onSend={() => fromRaw("wine_type")} disabled={mergeDone} />
          <SourceField label="producer_ko" value={raw?.producer_ko} onSend={() => fromRaw("producer_ko")} disabled={mergeDone} />
          <SourceField label="producer_en" value={raw?.producer_en} onSend={() => fromRaw("producer_en")} disabled={mergeDone} />
          <SourceField label="country" value={raw?.country} onSend={() => fromRaw("country")} disabled={mergeDone} />
          <SourceField label="region" value={raw?.region} onSend={() => fromRaw("region")} disabled={mergeDone} />
          <SourceField label="grape" value={rawGrapeText(raw) || "-"} onSend={() => fromRaw("grape_varieties")} disabled={mergeDone} />
          <SourceField label="alcohol" value={raw?.alcohol} onSend={() => fromRaw("alcohol")} disabled={mergeDone} />
          <div className="text-[10px] text-zinc-600 mt-2 font-mono truncate">id: {raw?.id}</div>
        </div>

        {/* 중: WINES target */}
        <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold text-emerald-400 tracking-wider">WINES (기존)</div>
            <button onClick={loadAllFromTarget} disabled={isPending || mergeDone} className="text-[11px] px-2 py-0.5 rounded bg-emerald-900 hover:bg-emerald-800 text-emerald-200 border border-emerald-800 disabled:opacity-40">
              전체 →
            </button>
          </div>
          {tgt?.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tgt.image_url} alt={tgt.name_ko ?? ""} className="w-20 h-28 object-contain bg-zinc-950 rounded mb-2" />
          )}
          <SourceField label="name_ko" value={tgt?.name_ko} onSend={() => fromTarget("name_ko")} disabled={mergeDone} accent="emerald" />
          <SourceField label="name_en" value={tgt?.name_en} onSend={() => fromTarget("name_en")} disabled={mergeDone} accent="emerald" />
          <SourceField label="타입" value={tgt?.wine_type} onSend={() => fromTarget("wine_type")} disabled={mergeDone} accent="emerald" />
          <SourceField label="producer_ko" value={tgt?.producer_ko} onSend={() => fromTarget("producer_ko")} disabled={mergeDone} accent="emerald" />
          <SourceField label="producer_en" value={tgt?.producer_en} onSend={() => fromTarget("producer_en")} disabled={mergeDone} accent="emerald" />
          <SourceField label="country_ko" value={tgt?.country_ko} onSend={() => fromTarget("country_ko")} disabled={mergeDone} accent="emerald" />
          <SourceField label="region_ko" value={tgt?.region_ko} onSend={() => fromTarget("region_ko")} disabled={mergeDone} accent="emerald" />
          <SourceField label="grape" value={targetGrapeText(tgt) || "-"} onSend={() => fromTarget("grape_varieties")} disabled={mergeDone} accent="emerald" />
          <SourceField label="alcohol" value={tgt?.alcohol} onSend={() => fromTarget("alcohol")} disabled={mergeDone} accent="emerald" />
          <div className="text-[10px] text-zinc-600 mt-2 font-mono truncate">id: {tgt?.id}</div>
        </div>

        {/* 우: 최종 예정 (편집 가능) */}
        <div className={`rounded-lg border ${mergeDone ? "border-emerald-700 bg-emerald-950/40" : "border-rose-900/60 bg-rose-950/10"} p-4`}>
          <div className="text-xs font-bold tracking-wider mb-3 flex items-center gap-2">
            <span className={mergeDone ? "text-emerald-400" : "text-rose-400"}>{mergeDone ? "반영됨" : "최종 예정"}</span>
            {!mergeDone && <span className="text-[10px] text-zinc-500 font-normal">← 선택·편집 후 Merge</span>}
          </div>
          <EditRow label="name_ko" value={draft.name_ko} onChange={(v) => setField("name_ko", v)} disabled={mergeDone} />
          <EditRow label="name_en" value={draft.name_en} onChange={(v) => setField("name_en", v)} disabled={mergeDone} />
          <EditSelectRow label="타입" value={draft.wine_type} options={["", ...WINE_TYPES]} onChange={(v) => setField("wine_type", v)} disabled={mergeDone} />
          <EditRow label="producer_ko" value={draft.producer_ko} onChange={(v) => setField("producer_ko", v)} disabled={mergeDone} />
          <EditRow label="producer_en" value={draft.producer_en} onChange={(v) => setField("producer_en", v)} disabled={mergeDone} />
          <EditRow label="country" value={draft.country} onChange={(v) => setField("country", v)} disabled={mergeDone} />
          <EditRow label="country_ko" value={draft.country_ko} onChange={(v) => setField("country_ko", v)} disabled={mergeDone} />
          <EditRow label="region" value={draft.region} onChange={(v) => setField("region", v)} disabled={mergeDone} />
          <EditRow label="region_ko" value={draft.region_ko} onChange={(v) => setField("region_ko", v)} disabled={mergeDone} />
          <EditRow label="grape (,)" value={draft.grape_varieties} onChange={(v) => setField("grape_varieties", v)} disabled={mergeDone} />
          <EditRow label="alcohol" value={draft.alcohol} onChange={(v) => setField("alcohol", v)} disabled={mergeDone} />
          <EditRow label="image_url" value={draft.image_url} onChange={(v) => setField("image_url", v)} disabled={mergeDone} />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <button onClick={handleReject} disabled={isPending || mergeDone} className="px-4 py-4 rounded-md bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 font-medium border border-zinc-700 transition-colors">
          <div className="text-base">다른 와인</div>
          <div className="text-xs font-normal opacity-80 mt-0.5">반려 · D</div>
        </button>
        <button onClick={handleSkip} disabled={isPending} className="px-4 py-4 rounded-md bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-zinc-400 font-medium border border-zinc-800 transition-colors">
          <div className="text-base">나중에</div>
          <div className="text-xs font-normal opacity-80 mt-0.5">건너뜀 · S</div>
        </button>
        <button onClick={handleConfirm} disabled={isPending} className={`px-4 py-4 rounded-md ${mergeDone ? "bg-emerald-800 hover:bg-emerald-700" : "bg-emerald-600 hover:bg-emerald-700"} disabled:opacity-40 text-white font-bold transition-colors col-span-2 md:col-span-1`}>
          <div className="text-base">{mergeDone ? "재병합" : "Merge"}</div>
          <div className="text-xs font-normal opacity-80 mt-0.5">최종 예정값으로 · M</div>
        </button>
        <button onClick={advance} disabled={isPending || !mergeDone} className="px-4 py-4 rounded-md bg-rose-600 hover:bg-rose-700 disabled:opacity-30 text-white font-bold transition-colors col-span-2 md:col-span-1">
          <div className="text-base">다음 후보 →</div>
          <div className="text-xs font-normal opacity-80 mt-0.5">merge 완료 후 · N</div>
        </button>
      </div>
    </div>
  );
}

function SourceField({ label, value, onSend, disabled, accent }: { label: string; value: string | null | undefined; onSend: () => void; disabled?: boolean; accent?: "emerald" }) {
  const btnCls = accent === "emerald"
    ? "bg-emerald-900/50 hover:bg-emerald-800 text-emerald-200 border-emerald-800"
    : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700";
  return (
    <div className="py-1.5 border-b border-zinc-800/50 last:border-b-0">
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span className="text-[11px] text-zinc-500 font-medium uppercase tracking-wide">{label}</span>
        <button
          onClick={onSend}
          disabled={disabled || !value}
          className={`text-[10px] px-1.5 py-0.5 rounded border ${btnCls} disabled:opacity-30 shrink-0 whitespace-nowrap`}
          title="최종 예정으로 복사"
        >
          → 복사
        </button>
      </div>
      <div className={`text-sm break-words whitespace-pre-wrap leading-snug ${value ? "text-zinc-100" : "text-zinc-600"}`}>
        {value || "-"}
      </div>
    </div>
  );
}

function EditRow({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="py-1.5 border-b border-zinc-800/50 last:border-b-0">
      <span className="text-[11px] text-zinc-500 font-medium uppercase tracking-wide block mb-0.5">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-2 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:border-zinc-500 focus:outline-none disabled:opacity-50"
      />
    </div>
  );
}

function EditSelectRow({ label, value, options, onChange, disabled }: { label: string; value: string; options: string[]; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="py-1.5 border-b border-zinc-800/50 last:border-b-0">
      <span className="text-[11px] text-zinc-500 font-medium uppercase tracking-wide block mb-0.5">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-2 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm focus:border-zinc-500 focus:outline-none disabled:opacity-50"
      >
        {options.map((o) => <option key={o} value={o}>{o || "(미지정)"}</option>)}
      </select>
    </div>
  );
}
