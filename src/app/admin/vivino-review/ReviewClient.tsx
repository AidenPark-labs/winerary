"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { confirmVivinoMatch, unlinkVivinoMatch } from "./actions";

export type ReviewMode = "all" | "salvaged";

export interface ReviewWine {
  id: string;
  name_ko: string;
  name_en: string | null;
  wine_type: string | null;
  country: string | null;
  region: string | null;
  grape_variety: string | null;
  producer: string | null;
  image_url: string | null;
  vivino_url: string | null;
  vivino_page_url: string | null;
  vivino_wine_id: number | null;
  vivino_rating: number | null;
  vivino_reviews: number | null;
  vivino_winery: string | null;
  vivino_grapes: string | null;
  vivino_region: string | null;
  vivino_style: string | null;
  vivino_alcohol: string | null;
  vivino_description: string | null;
  vivino_needs_review: boolean | null;
  vivino_reviewed_at: string | null;
}

interface Props {
  mode: ReviewMode;
  wines: ReviewWine[];
  pendingInMode: number;
  totalAll: number;
  totalSalvaged: number;
}

export default function ReviewClient({ mode, wines, pendingInMode, totalAll, totalSalvaged }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cursor, setCursor] = useState(0);
  const [sessionKept, setSessionKept] = useState(0);
  const [sessionUnlinked, setSessionUnlinked] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [justActioned, setJustActioned] = useState<"keep" | "unlink" | "skip" | null>(null);

  // 모드 전환 시 커서 리셋
  useEffect(() => {
    setCursor(0);
    setSessionKept(0);
    setSessionUnlinked(0);
    setError(null);
  }, [mode]);

  const current = wines[cursor];
  const hasMoreBeyondBatch = pendingInMode > wines.length;

  const advance = useCallback((kind: "keep" | "unlink" | "skip") => {
    setJustActioned(kind);
    setTimeout(() => setJustActioned(null), 400);
    setCursor((c) => c + 1);
  }, []);

  const handleKeep = useCallback(() => {
    if (!current || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await confirmVivinoMatch(current.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSessionKept((n) => n + 1);
      advance("keep");
    });
  }, [current, isPending, advance]);

  const handleUnlink = useCallback(() => {
    if (!current || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await unlinkVivinoMatch(current.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSessionUnlinked((n) => n + 1);
      advance("unlink");
    });
  }, [current, isPending, advance]);

  const handleSkip = useCallback(() => {
    if (!current || isPending) return;
    advance("skip");
  }, [current, isPending, advance]);

  const handleLoadNext = useCallback(() => {
    router.refresh();
    setCursor(0);
  }, [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "k" || e.key === "K") handleKeep();
      else if (e.key === "u" || e.key === "U") handleUnlink();
      else if (e.key === "s" || e.key === "S") handleSkip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleKeep, handleUnlink, handleSkip]);

  return (
    <div>
      {/* 모드 탭 */}
      <ModeTabs mode={mode} totalAll={totalAll} totalSalvaged={totalSalvaged} />

      {/* 빈 상태 / 배치 소진 상태 */}
      {!current ? (
        <EmptyState
          mode={mode}
          pendingInMode={pendingInMode}
          sessionKept={sessionKept}
          sessionUnlinked={sessionUnlinked}
          hasMoreBeyondBatch={hasMoreBeyondBatch}
          onLoadNext={handleLoadNext}
        />
      ) : (
        <>
          {/* 진행도 + 단축키 */}
          <div className="flex items-center justify-between mb-4 text-sm">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-zinc-300">
                배치 <span className="font-bold text-rose-400">{cursor + 1}</span>
                <span className="text-zinc-500"> / {wines.length}</span>
              </span>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-400">
                {mode === "all" ? "미검수" : "SALVAGED"} 잔여{" "}
                <span className="font-bold text-zinc-200">
                  {Math.max(0, pendingInMode - sessionKept - sessionUnlinked)}
                </span>
                건
              </span>
              <span className="text-zinc-600">·</span>
              <span className="text-xs text-zinc-500">
                세션: 확정 {sessionKept} / 해제 {sessionUnlinked}
              </span>
            </div>
            <div className="text-xs text-zinc-500 flex gap-3">
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">K</kbd> 유지
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">U</kbd> 해제
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">S</kbd> 건너뜀
              </span>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded bg-red-950/50 border border-red-900 text-red-300 text-sm">
              오류: {error}
            </div>
          )}

          {/* 상태 배지 */}
          <div className="flex gap-2 mb-3">
            {current.vivino_needs_review && (
              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-bold bg-amber-950 border border-amber-800 text-amber-300">
                SALVAGED 마킹
              </span>
            )}
            {current.vivino_reviewed_at && (
              <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-zinc-900 border border-zinc-800 text-zinc-400">
                최근 검수: {formatDate(current.vivino_reviewed_at)}
              </span>
            )}
            {!current.vivino_needs_review && !current.vivino_reviewed_at && mode === "all" && (
              <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-zinc-900 border border-zinc-800 text-zinc-500">
                미검수 (PASS)
              </span>
            )}
          </div>

          {/* 좌우 비교 카드 */}
          <div
            className={`grid grid-cols-1 md:grid-cols-2 gap-4 transition-all duration-150 ${
              isPending ? "opacity-50" : ""
            } ${justActioned ? "scale-[0.99]" : ""}`}
          >
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
              <div className="text-xs font-bold text-zinc-500 mb-3 tracking-wider">와이너리 DB</div>
              {current.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.image_url}
                  alt={current.name_ko}
                  className="w-24 h-32 object-contain bg-zinc-950 rounded mb-3"
                />
              )}
              <div className="text-lg font-bold text-zinc-100 mb-1">{current.name_ko}</div>
              <div className="text-sm text-zinc-400 mb-4">{current.name_en ?? "-"}</div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                <Row label="타입" value={current.wine_type} />
                <Row label="생산자" value={current.producer} />
                <Row label="국가" value={current.country} />
                <Row label="지역" value={current.region} />
                <Row label="품종" value={current.grape_variety} />
              </dl>
            </div>

            <div className="rounded-lg border border-violet-900/50 bg-violet-950/20 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-bold text-violet-400 tracking-wider">VIVINO 매칭</div>
                {current.vivino_rating != null && (
                  <div className="text-sm">
                    <span className="font-bold text-amber-400">★ {current.vivino_rating.toFixed(1)}</span>
                    {current.vivino_reviews != null && (
                      <span className="text-zinc-500 ml-1">({current.vivino_reviews.toLocaleString()})</span>
                    )}
                  </div>
                )}
              </div>
              {(() => {
                const link = current.vivino_page_url ?? current.vivino_url;
                return link ? (
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-sm text-violet-300 hover:text-violet-200 underline underline-offset-4 mb-4 break-all"
                  >
                    {link} ↗
                  </a>
                ) : (
                  <div className="text-sm text-zinc-600 mb-4">(URL 없음)</div>
                );
              })()}
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                <Row label="와이너리" value={current.vivino_winery} highlight />
                <Row label="지역" value={current.vivino_region} highlight />
                <Row label="품종" value={current.vivino_grapes} highlight />
                <Row label="스타일" value={current.vivino_style} />
                <Row label="도수" value={current.vivino_alcohol} />
              </dl>
              {current.vivino_description && (
                <div className="mt-3 pt-3 border-t border-violet-900/50 text-xs text-zinc-400 line-clamp-4">
                  {current.vivino_description}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <button
              onClick={handleUnlink}
              disabled={isPending}
              className="px-4 py-4 rounded-md bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold transition-colors"
            >
              <div className="text-base">매칭 해제</div>
              <div className="text-xs font-normal opacity-80 mt-0.5">Vivino 정보 초기화 · U</div>
            </button>
            <button
              onClick={handleSkip}
              disabled={isPending}
              className="px-4 py-4 rounded-md bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-200 font-medium transition-colors"
            >
              <div className="text-base">나중에</div>
              <div className="text-xs font-normal opacity-80 mt-0.5">세션에서만 건너뜀 · S</div>
            </button>
            <button
              onClick={handleKeep}
              disabled={isPending}
              className="px-4 py-4 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold transition-colors"
            >
              <div className="text-base">매칭 유지</div>
              <div className="text-xs font-normal opacity-80 mt-0.5">검수 완료 처리 · K</div>
            </button>
          </div>

          <div className="mt-4 text-xs text-zinc-600 text-center">
            ID: <span className="font-mono">{current.id}</span>
          </div>
        </>
      )}
    </div>
  );
}

function ModeTabs({
  mode,
  totalAll,
  totalSalvaged,
}: {
  mode: ReviewMode;
  totalAll: number;
  totalSalvaged: number;
}) {
  const base =
    "px-4 py-2 rounded-md text-sm font-medium transition-colors border";
  const active = "bg-zinc-100 text-zinc-900 border-zinc-100";
  const inactive = "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700";
  return (
    <div className="flex gap-2 mb-4">
      <Link
        href="/admin/vivino-review?mode=all"
        className={`${base} ${mode === "all" ? active : inactive}`}
      >
        전체 매칭 <span className="opacity-60">({totalAll.toLocaleString()})</span>
      </Link>
      <Link
        href="/admin/vivino-review?mode=salvaged"
        className={`${base} ${mode === "salvaged" ? active : inactive}`}
      >
        SALVAGED만 <span className="opacity-60">({totalSalvaged.toLocaleString()})</span>
      </Link>
    </div>
  );
}

function EmptyState({
  mode,
  pendingInMode,
  sessionKept,
  sessionUnlinked,
  hasMoreBeyondBatch,
  onLoadNext,
}: {
  mode: ReviewMode;
  pendingInMode: number;
  sessionKept: number;
  sessionUnlinked: number;
  hasMoreBeyondBatch: boolean;
  onLoadNext: () => void;
}) {
  const allDone = pendingInMode === 0 || pendingInMode - sessionKept - sessionUnlinked <= 0;
  const modeLabel = mode === "all" ? "미검수 매칭" : "SALVAGED";

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-10 text-center">
      {allDone && !hasMoreBeyondBatch ? (
        <>
          <div className="text-xl font-bold text-emerald-400 mb-2">{modeLabel} 검수가 완료되었습니다</div>
          <div className="text-sm text-zinc-400">
            이 세션: 확정 {sessionKept}건, 해제 {sessionUnlinked}건.
          </div>
        </>
      ) : hasMoreBeyondBatch ? (
        <>
          <div className="text-xl font-bold mb-2">이 배치 완료</div>
          <div className="text-sm text-zinc-400 mb-6">
            세션: 확정 {sessionKept} / 해제 {sessionUnlinked} · {modeLabel} 잔여{" "}
            {Math.max(0, pendingInMode - sessionKept - sessionUnlinked)}건
          </div>
          <button
            onClick={onLoadNext}
            className="px-6 py-3 rounded-md bg-rose-500 hover:bg-rose-600 text-white font-bold transition-colors"
          >
            다음 50건 가져오기
          </button>
        </>
      ) : (
        <>
          <div className="text-xl font-bold text-emerald-400 mb-2">이 세션에서 다 처리했습니다</div>
          <div className="text-sm text-zinc-400 mb-4">
            확정 {sessionKept}건, 해제 {sessionUnlinked}건.
          </div>
          <button
            onClick={onLoadNext}
            className="px-6 py-3 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition-colors"
          >
            새로고침
          </button>
        </>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | null | undefined;
  highlight?: boolean;
}) {
  return (
    <>
      <dt className="text-zinc-500">{label}</dt>
      <dd className={value ? (highlight ? "text-violet-200" : "text-zinc-200") : "text-zinc-600"}>
        {value || "-"}
      </dd>
    </>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
