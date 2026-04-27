"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { confirmVivinoMatch, unlinkVivinoMatch, replaceVivinoUrl, updateWineFields, type WineFieldUpdate } from "./actions";

export type ReviewMode = "all" | "salvaged";

export interface ReviewWine {
  id: string;
  name_ko: string;
  name_en: string | null;
  wine_type: string | null;
  country: string | null;
  country_ko: string | null;
  region: string | null;
  region_ko: string | null;
  grape_variety: string | null;
  grape_varieties: string[] | null;
  producer: string | null;
  producer_ko: string | null;
  producer_en: string | null;
  winery_en_clean: string | null;
  image_url: string | null;
  vivino_url: string | null;
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

function displayProducer(w: ReviewWine): string | null {
  return w.producer_ko || w.producer_en || w.winery_en_clean || w.producer || null;
}

function displayGrapes(w: ReviewWine): string | null {
  if (Array.isArray(w.grape_varieties) && w.grape_varieties.length > 0) {
    return w.grape_varieties.join(", ");
  }
  return w.grape_variety || null;
}

function displayCountry(w: ReviewWine): string | null {
  return w.country_ko || w.country || null;
}

function displayRegion(w: ReviewWine): string | null {
  return w.region_ko || w.region || null;
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
  const [sessionReplaced, setSessionReplaced] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [justActioned, setJustActioned] = useState<"keep" | "unlink" | "skip" | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState<WineFieldUpdate>({});
  const [saving, setSaving] = useState(false);

  // 모드 전환 시 커서 리셋
  useEffect(() => {
    setCursor(0);
    setSessionKept(0);
    setSessionUnlinked(0);
    setSessionReplaced(0);
    setError(null);
  }, [mode]);

  // 후보가 바뀌면 URL 입력란 + 편집 모드 초기화
  useEffect(() => {
    setUrlInput("");
    setEditMode(false);
    setEditDraft({});
  }, [cursor]);

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

  const handleEditSave = useCallback(async () => {
    if (!current || saving) return;
    if (Object.keys(editDraft).length === 0) {
      setEditMode(false);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const result = await updateWineFields(current.id, editDraft);
      if (result.error) {
        setError(result.error);
      } else {
        setEditDraft({});
        setEditMode(false);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }, [current, editDraft, saving, router]);

  const handleEditCancel = useCallback(() => {
    setEditDraft({});
    setEditMode(false);
  }, []);

  const handleReplaceUrl = useCallback(async () => {
    if (!current || replacing) return;
    const url = urlInput.trim();
    if (!url) {
      setError("교체할 Vivino URL을 입력하세요");
      return;
    }
    setError(null);
    setReplacing(true);
    try {
      const result = await replaceVivinoUrl(current.id, url);
      if (result.error) {
        setError(result.error);
      } else {
        setSessionReplaced((n) => n + 1);
        router.refresh();
      }
    } finally {
      setReplacing(false);
    }
  }, [current, urlInput, replacing, router]);

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

  const anyBusy = isPending || replacing || saving;

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
                세션: 확정 {sessionKept} / 해제 {sessionUnlinked} / URL교체 {sessionReplaced}
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
              anyBusy ? "opacity-50" : ""
            } ${justActioned ? "scale-[0.99]" : ""}`}
          >
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-bold text-zinc-500 tracking-wider">와이너리 DB</div>
                {!editMode ? (
                  <button
                    onClick={() => {
                      setEditMode(true);
                      setEditDraft({
                        name_ko: current.name_ko ?? "",
                        name_en: current.name_en ?? "",
                        producer_ko: current.producer_ko ?? "",
                        producer_en: current.producer_en ?? "",
                        country: current.country ?? "",
                        country_ko: current.country_ko ?? "",
                        region: current.region ?? "",
                        region_ko: current.region_ko ?? "",
                        wine_type: current.wine_type ?? "",
                        grape_varieties: current.grape_varieties ?? [],
                      });
                    }}
                    className="px-2 py-0.5 rounded text-[11px] border border-zinc-700 text-zinc-300 hover:border-zinc-500"
                  >
                    편집
                  </button>
                ) : (
                  <div className="flex gap-1">
                    <button
                      onClick={handleEditSave}
                      disabled={saving}
                      className="px-2 py-0.5 rounded text-[11px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-medium"
                    >
                      {saving ? "저장 중…" : "저장"}
                    </button>
                    <button
                      onClick={handleEditCancel}
                      disabled={saving}
                      className="px-2 py-0.5 rounded text-[11px] border border-zinc-700 text-zinc-300 hover:border-zinc-500"
                    >
                      취소
                    </button>
                  </div>
                )}
              </div>
              {current.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.image_url}
                  alt={current.name_ko}
                  className="w-24 h-32 object-contain bg-zinc-950 rounded mb-3"
                />
              )}
              {editMode ? (
                <div className="space-y-1.5 text-sm">
                  <EditRow
                    label="name_ko"
                    value={editDraft.name_ko ?? ""}
                    onChange={(v) => setEditDraft((d) => ({ ...d, name_ko: v }))}
                  />
                  <EditRow
                    label="name_en"
                    value={editDraft.name_en ?? ""}
                    onChange={(v) => setEditDraft((d) => ({ ...d, name_en: v }))}
                  />
                  <EditSelectRow
                    label="타입"
                    value={editDraft.wine_type ?? ""}
                    onChange={(v) => setEditDraft((d) => ({ ...d, wine_type: v }))}
                    options={["", "red", "white", "rose", "sparkling", "fortified", "dessert", "other"]}
                  />
                  <EditRow
                    label="생산자(ko)"
                    value={editDraft.producer_ko ?? ""}
                    onChange={(v) => setEditDraft((d) => ({ ...d, producer_ko: v }))}
                  />
                  <EditRow
                    label="생산자(en)"
                    value={editDraft.producer_en ?? ""}
                    onChange={(v) => setEditDraft((d) => ({ ...d, producer_en: v }))}
                  />
                  <EditRow
                    label="국가(en)"
                    value={editDraft.country ?? ""}
                    onChange={(v) => setEditDraft((d) => ({ ...d, country: v }))}
                  />
                  <EditRow
                    label="국가(ko)"
                    value={editDraft.country_ko ?? ""}
                    onChange={(v) => setEditDraft((d) => ({ ...d, country_ko: v }))}
                  />
                  <EditRow
                    label="지역(en)"
                    value={editDraft.region ?? ""}
                    onChange={(v) => setEditDraft((d) => ({ ...d, region: v }))}
                  />
                  <EditRow
                    label="지역(ko)"
                    value={editDraft.region_ko ?? ""}
                    onChange={(v) => setEditDraft((d) => ({ ...d, region_ko: v }))}
                  />
                  <EditRow
                    label="품종(쉼표)"
                    value={(editDraft.grape_varieties ?? []).join(", ")}
                    onChange={(v) =>
                      setEditDraft((d) => ({
                        ...d,
                        grape_varieties: v.split(",").map((s) => s.trim()).filter((s) => s.length > 0),
                      }))
                    }
                  />
                </div>
              ) : (
                <>
                  <div className="text-lg font-bold text-zinc-100 mb-1">{current.name_ko}</div>
                  <div className="text-sm text-zinc-400 mb-4">{current.name_en ?? "-"}</div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                    <Row label="타입" value={current.wine_type} />
                    <Row label="생산자" value={displayProducer(current)} />
                    <Row label="국가" value={displayCountry(current)} />
                    <Row label="지역" value={displayRegion(current)} />
                    <Row label="품종" value={displayGrapes(current)} />
                  </dl>
                </>
              )}
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
                const link = current.vivino_url;
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

              {/* URL 교체 섹션 */}
              <div className="mt-4 pt-3 border-t border-violet-900/50">
                <div className="text-[11px] font-bold text-violet-400 tracking-wider mb-2">URL 교체 (올바른 Vivino 페이지를 찾았을 때)</div>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://www.vivino.com/en/..."
                    disabled={replacing}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleReplaceUrl();
                      }
                    }}
                    className="flex-1 px-2 py-1.5 rounded bg-zinc-950 border border-violet-900/50 text-zinc-200 text-xs focus:border-violet-700 focus:outline-none disabled:opacity-40"
                  />
                  <button
                    onClick={handleReplaceUrl}
                    disabled={replacing || !urlInput.trim()}
                    className="px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium whitespace-nowrap"
                  >
                    {replacing ? "크롤링 중…" : "URL 교체"}
                  </button>
                </div>
                <div className="text-[10px] text-zinc-600 mt-1">
                  * 새 URL로 크롤링 후 카드가 갱신됩니다. 이후 K(유지)/U(해제)로 최종 확정.
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <button
              onClick={handleUnlink}
              disabled={anyBusy}
              className="px-4 py-4 rounded-md bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold transition-colors"
            >
              <div className="text-base">매칭 해제</div>
              <div className="text-xs font-normal opacity-80 mt-0.5">Vivino 정보 초기화 · U</div>
            </button>
            <button
              onClick={handleSkip}
              disabled={anyBusy}
              className="px-4 py-4 rounded-md bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-200 font-medium transition-colors"
            >
              <div className="text-base">나중에</div>
              <div className="text-xs font-normal opacity-80 mt-0.5">세션에서만 건너뜀 · S</div>
            </button>
            <button
              onClick={handleKeep}
              disabled={anyBusy}
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

function EditRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 items-center">
      <span className="text-xs text-zinc-500">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm focus:border-zinc-600 focus:outline-none"
      />
    </div>
  );
}

function EditSelectRow({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 items-center">
      <span className="text-xs text-zinc-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-200 text-sm focus:border-zinc-600 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o || "(미지정)"}</option>
        ))}
      </select>
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
