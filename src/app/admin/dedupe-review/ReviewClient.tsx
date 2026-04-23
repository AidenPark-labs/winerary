"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { confirmDedupe, rejectDedupe } from "./actions";

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
  // raw_wines 테이블엔 grape_varieties 배열 컬럼이 없음 (wines에만).
  // grape_variety(쉼표 구분 문자열)만 존재. 표시에선 grape_variety 사용.
  grape_varieties?: string[] | null;
  image_url: string | null;
}

interface TargetWine {
  id: string;
  name_ko: string | null;
  name_en: string | null;
  producer_ko: string | null;
  producer_en: string | null;
  country: string | null;
  region: string | null;
  wine_type: string | null;
  grape_varieties: string[] | null;
  image_url: string | null;
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
  name_ko_variant: {
    label: "한글 음차 차이",
    cls: "bg-amber-950 border-amber-800 text-amber-300",
    desc: "영문명과 국가는 동일, 한글 표기만 차이",
  },
  name_en_variant: {
    label: "영문 표기 차이",
    cls: "bg-sky-950 border-sky-800 text-sky-300",
    desc: "한글명과 국가는 동일, 영문 표기만 차이",
  },
  country_mismatch: {
    label: "국가 불일치",
    cls: "bg-violet-950 border-violet-800 text-violet-300",
    desc: "이름은 동일, 국가만 다름",
  },
  fuzzy_name: {
    label: "유사 이름",
    cls: "bg-rose-950 border-rose-800 text-rose-300",
    desc: "정규화 Levenshtein 거리 ≤ 2",
  },
};

export default function ReviewClient({ candidates, pendingCount }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cursor, setCursor] = useState(0);
  const [sessionConfirmed, setSessionConfirmed] = useState(0);
  const [sessionRejected, setSessionRejected] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const current = candidates[cursor];
  const hasMoreBeyondBatch = pendingCount > candidates.length;

  const advance = useCallback(() => setCursor((c) => c + 1), []);

  const handleConfirmKeepTarget = useCallback(() => {
    if (!current || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await confirmDedupe(current.id, "keep_target");
      if (result.error) {
        setError(result.error);
        return;
      }
      setSessionConfirmed((n) => n + 1);
      advance();
    });
  }, [current, isPending, advance]);

  const handleConfirmUseRaw = useCallback(() => {
    if (!current || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await confirmDedupe(current.id, "use_raw");
      if (result.error) {
        setError(result.error);
        return;
      }
      setSessionConfirmed((n) => n + 1);
      advance();
    });
  }, [current, isPending, advance]);

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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "m" || e.key === "M") handleConfirmKeepTarget();
      else if (e.key === "r" || e.key === "R") handleConfirmUseRaw();
      else if (e.key === "d" || e.key === "D") handleReject();
      else if (e.key === "s" || e.key === "S") handleSkip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleConfirmKeepTarget, handleConfirmUseRaw, handleReject, handleSkip]);

  if (!current) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-10 text-center">
        {pendingCount === 0 ? (
          <>
            <div className="text-xl font-bold text-emerald-400 mb-2">검수할 후보가 없습니다</div>
            <div className="text-sm text-zinc-400">
              이 세션: merge {sessionConfirmed} · 반려 {sessionRejected}
            </div>
          </>
        ) : hasMoreBeyondBatch ? (
          <>
            <div className="text-xl font-bold mb-2">이 배치 완료</div>
            <div className="text-sm text-zinc-400 mb-6">
              세션: merge {sessionConfirmed} · 반려 {sessionRejected} / 전체 잔여 {pendingCount}건
            </div>
            <button
              onClick={handleLoadNext}
              className="px-6 py-3 rounded-md bg-rose-500 hover:bg-rose-600 text-white font-bold transition-colors"
            >
              다음 50건 가져오기
            </button>
          </>
        ) : (
          <>
            <div className="text-xl font-bold text-emerald-400 mb-2">이 세션에서 다 처리했습니다</div>
            <button
              onClick={handleLoadNext}
              className="mt-4 px-6 py-3 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition-colors"
            >
              새로고침
            </button>
          </>
        )}
      </div>
    );
  }

  const raw = current.raw_wine;
  const tgt = current.target_wine;
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
            전체 pending{" "}
            <span className="font-bold text-zinc-200">
              {Math.max(0, pendingCount - sessionConfirmed - sessionRejected)}
            </span>
            건
          </span>
          <span className="text-zinc-600">·</span>
          <span className="text-xs text-zinc-500">
            세션: merge {sessionConfirmed} / 반려 {sessionRejected}
          </span>
        </div>
        <div className="text-xs text-zinc-500 flex gap-3 flex-wrap">
          <span><kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">M</kbd> Merge (기존 유지)</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">R</kbd> Merge (raw 반영)</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">D</kbd> 다른 와인</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">S</kbd> 건너뜀</span>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-950/50 border border-red-900 text-red-300 text-sm">
          오류: {error}
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold border ${reason.cls}`}>
          {reason.label}
        </span>
        <span className="text-xs text-zinc-500">{reason.desc}</span>
        {current.match_score != null && (
          <span className="text-xs text-zinc-400 ml-auto">
            유사도 {(current.match_score * 100).toFixed(1)}%
          </span>
        )}
      </div>

      <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 transition-opacity ${isPending ? "opacity-50" : ""}`}>
        {/* 좌: raw_wine (신규 수집, 아직 promote 안 됨) */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
          <div className="text-xs font-bold text-zinc-500 mb-3 tracking-wider flex items-center gap-2">
            <span>RAW_WINES (신규)</span>
            {raw && (
              <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-normal text-[11px]">
                {raw.source}
              </span>
            )}
          </div>
          {raw?.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={raw.image_url} alt={raw.name_ko ?? ""} className="w-24 h-32 object-contain bg-zinc-950 rounded mb-3" />
          )}
          <div className="text-lg font-bold text-zinc-100 mb-1">{raw?.name_ko ?? "-"}</div>
          <div className="text-sm text-zinc-400 mb-4">{raw?.name_en ?? "-"}</div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            <Row label="타입" value={raw?.wine_type} />
            <Row label="생산자" value={raw?.producer_ko ?? raw?.producer_en} />
            <Row label="국가" value={raw?.country} />
            <Row label="지역" value={raw?.region} />
            <Row label="품종" value={(raw?.grape_varieties ?? []).join(", ") || raw?.grape_variety} />
          </dl>
          <div className="text-[11px] text-zinc-600 mt-3 font-mono truncate">
            id: {raw?.id}
          </div>
        </div>

        {/* 우: target_wine (기존 wines) */}
        <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-5">
          <div className="text-xs font-bold text-emerald-400 mb-3 tracking-wider">WINES (기존 카탈로그)</div>
          {tgt?.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tgt.image_url} alt={tgt.name_ko ?? ""} className="w-24 h-32 object-contain bg-zinc-950 rounded mb-3" />
          )}
          <div className="text-lg font-bold text-zinc-100 mb-1">{tgt?.name_ko ?? "-"}</div>
          <div className="text-sm text-zinc-400 mb-4">{tgt?.name_en ?? "-"}</div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            <Row label="타입" value={tgt?.wine_type} />
            <Row label="생산자" value={tgt?.producer_ko ?? tgt?.producer_en} />
            <Row label="국가" value={tgt?.country} />
            <Row label="지역" value={tgt?.region} />
            <Row label="품종" value={(tgt?.grape_varieties ?? []).join(", ")} />
          </dl>
          <div className="text-[11px] text-zinc-600 mt-3 font-mono truncate">
            id: {tgt?.id}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          onClick={handleReject}
          disabled={isPending}
          className="px-4 py-4 rounded-md bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 font-medium border border-zinc-700 transition-colors"
        >
          <div className="text-base">다른 와인</div>
          <div className="text-xs font-normal opacity-80 mt-0.5">반려, 별도 promote · D</div>
        </button>
        <button
          onClick={handleSkip}
          disabled={isPending}
          className="px-4 py-4 rounded-md bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-zinc-400 font-medium border border-zinc-800 transition-colors"
        >
          <div className="text-base">나중에</div>
          <div className="text-xs font-normal opacity-80 mt-0.5">세션에서만 건너뜀 · S</div>
        </button>
        <button
          onClick={handleConfirmKeepTarget}
          disabled={isPending}
          className="px-4 py-4 rounded-md bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white font-bold transition-colors"
          title="기존 wines(우측) 값 유지. raw의 non-null 필드로 빈 곳만 채움"
        >
          <div className="text-base">Merge</div>
          <div className="text-xs font-normal opacity-80 mt-0.5">기존 유지 · M</div>
        </button>
        <button
          onClick={handleConfirmUseRaw}
          disabled={isPending}
          className="px-4 py-4 rounded-md bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white font-bold transition-colors"
          title="raw(좌측) 값으로 target 덮어쓰기. raw 쪽 정보가 더 정확할 때."
        >
          <div className="text-base">Merge</div>
          <div className="text-xs font-normal opacity-80 mt-0.5">raw 반영 · R</div>
        </button>
      </div>
      <div className="mt-2 text-[11px] text-zinc-500">
        <span className="text-emerald-400">M (기존 유지)</span>: target의 빈 필드만 raw로 채움. 기존 값 그대로.
        <span className="mx-2">·</span>
        <span className="text-rose-400">R (raw 반영)</span>: raw의 non-null 값으로 target 덮어쓰기.
        품종 배열은 두 경우 모두 합집합.
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <>
      <dt className="text-zinc-500">{label}</dt>
      <dd className={value ? "text-zinc-200" : "text-zinc-600"}>{value || "-"}</dd>
    </>
  );
}
