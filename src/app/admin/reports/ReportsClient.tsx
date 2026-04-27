"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateWine, clearWineVivino } from "../wines/actions";
import { resolveReport, dismissReport, reopenReport, resolveAllForWine } from "./actions";

type Status = "open" | "resolved" | "dismissed";
type ReportType = "vivino_link" | "wine_name" | "other_info" | "custom";

interface WineRef {
  id: string;
  name_ko: string;
  name_en: string | null;
  wine_type: string | null;
  country: string | null;
  region: string | null;
  grape_variety: string | null;
  producer: string | null;
  vivino_url: string | null;
  vivino_rating: number | null;
  vivino_winery: string | null;
  vivino_region: string | null;
  vivino_grapes: string | null;
  vivino_style: string | null;
  final_wine_type: string | null;
  final_grapes: string | null;
  final_country: string | null;
  final_region: string | null;
  final_producer: string | null;
  final_alcohol: string | null;
  final_style: string | null;
  final_description: string | null;
}

interface Reporter {
  nickname: string | null;
  user_code: string | null;
}

export interface ReportRow {
  id: string;
  wine_id: string;
  user_id: string | null;
  report_type: ReportType;
  description: string | null;
  status: Status;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_note: string | null;
  wines: WineRef | null;
  reporter: Reporter | null;
}

const TYPE_LABEL: Record<ReportType, { label: string; cls: string }> = {
  vivino_link: { label: "Vivino 링크", cls: "bg-violet-900/50 text-violet-300" },
  wine_name: { label: "와인명", cls: "bg-rose-900/50 text-rose-300" },
  other_info: { label: "기타 정보", cls: "bg-sky-900/50 text-sky-300" },
  custom: { label: "직접 입력", cls: "bg-amber-900/50 text-amber-300" },
};

const STATUS_LABEL: Record<Status, string> = {
  open: "미처리",
  resolved: "처리됨",
  dismissed: "기각",
};

const FINAL_FIELDS: { key: keyof WineRef; label: string; fallback?: (w: WineRef) => string | null }[] = [
  { key: "final_wine_type", label: "타입", fallback: (w) => w.wine_type },
  { key: "final_grapes", label: "품종", fallback: (w) => w.vivino_grapes || w.grape_variety },
  { key: "final_country", label: "국가", fallback: (w) => w.country },
  { key: "final_region", label: "지역", fallback: (w) => w.vivino_region || w.region },
  { key: "final_producer", label: "생산자", fallback: (w) => w.vivino_winery || w.producer },
  { key: "final_alcohol", label: "도수" },
  { key: "final_style", label: "스타일", fallback: (w) => w.vivino_style },
  { key: "final_description", label: "설명" },
];

function formatDate(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString("ko-KR", {
    year: "2-digit", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function ReportsClient({
  reports,
  status,
  counts,
}: {
  reports: ReportRow[];
  status: Status;
  counts: Record<Status, number>;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [savingWine, setSavingWine] = useState<string | null>(null);
  const [busyReport, setBusyReport] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  function toggleExpand(report: ReportRow) {
    if (expanded === report.id) {
      setExpanded(null);
      return;
    }
    setExpanded(report.id);
    if (report.wines) {
      const fields: Record<string, string> = {};
      for (const { key } of FINAL_FIELDS) {
        const val = report.wines[key];
        fields[key] = val != null ? String(val) : "";
      }
      setEditFields(fields);
    }
    setSavedMsg(null);
  }

  async function handleSaveWine(wineId: string) {
    setSavingWine(wineId);
    setSavedMsg(null);
    const data: Record<string, string | null> = {};
    for (const { key } of FINAL_FIELDS) {
      const raw = editFields[key]?.trim();
      data[key] = raw || null;
    }
    const res = await updateWine(wineId, data);
    setSavingWine(null);
    if (res.error) {
      setSavedMsg(`오류: ${res.error}`);
    } else {
      setSavedMsg("저장 완료");
      startTransition(() => router.refresh());
    }
  }

  async function handleClearVivino(wineId: string) {
    if (!confirm("이 와인의 Vivino 매칭을 해제할까요? 별점·매칭된 Vivino 정보가 모두 제거됩니다.")) return;
    setSavingWine(wineId);
    const res = await clearWineVivino(wineId);
    setSavingWine(null);
    if (res.error) {
      alert(`실패: ${res.error}`);
    } else {
      setSavedMsg("Vivino 매칭이 해제되었습니다");
      startTransition(() => router.refresh());
    }
  }

  async function handleResolve(id: string) {
    const note = prompt("처리 메모 (선택)") ?? undefined;
    setBusyReport(id);
    const res = await resolveReport(id, note || undefined);
    setBusyReport(null);
    if (res.error) alert(res.error);
    else startTransition(() => router.refresh());
  }

  async function handleDismiss(id: string) {
    const note = prompt("기각 사유 (선택)") ?? undefined;
    setBusyReport(id);
    const res = await dismissReport(id, note || undefined);
    setBusyReport(null);
    if (res.error) alert(res.error);
    else startTransition(() => router.refresh());
  }

  async function handleReopen(id: string) {
    setBusyReport(id);
    const res = await reopenReport(id);
    setBusyReport(null);
    if (res.error) alert(res.error);
    else startTransition(() => router.refresh());
  }

  async function handleResolveAll(wineId: string) {
    if (!confirm("이 와인의 미처리 신고를 모두 처리 완료로 표시할까요?")) return;
    setBusyReport(wineId);
    const res = await resolveAllForWine(wineId);
    setBusyReport(null);
    if (res.error) alert(res.error);
    else startTransition(() => router.refresh());
  }

  return (
    <div>
      {/* 상태 탭 */}
      <div className="flex gap-2 mb-5">
        {(["open", "resolved", "dismissed"] as Status[]).map((s) => (
          <Link
            key={s}
            href={`/admin/reports?status=${s}`}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              status === s ? "bg-rose-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            {STATUS_LABEL[s]} ({counts[s]})
          </Link>
        ))}
      </div>

      {reports.length === 0 ? (
        <p className="text-zinc-500 text-sm py-16 text-center">해당 상태의 신고가 없습니다</p>
      ) : (
        <div className="flex flex-col gap-2">
          {reports.map((r) => {
            const wine = r.wines;
            const isOpen = expanded === r.id;
            const typeBadge = TYPE_LABEL[r.report_type];
            return (
              <div key={r.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
                <button
                  onClick={() => toggleExpand(r)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-zinc-800/50 transition-colors"
                >
                  <span className={`text-[11px] px-2 py-0.5 rounded ${typeBadge.cls} flex-shrink-0`}>
                    {typeBadge.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 truncate">
                      {wine?.name_ko ?? <span className="text-zinc-500 italic">삭제된 와인</span>}
                      {wine?.name_en && <span className="text-zinc-500 text-xs ml-2 font-light">{wine.name_en}</span>}
                    </p>
                    {r.description && (
                      <p className="text-xs text-zinc-400 mt-0.5 truncate">{r.description}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-[11px] text-zinc-500">{formatDate(r.created_at)}</p>
                    <p className="text-[11px] text-zinc-600 mt-0.5">
                      {r.reporter?.nickname ?? "익명"}
                      {r.reporter?.user_code && <span className="text-zinc-700"> · {r.reporter.user_code}</span>}
                    </p>
                  </div>
                  <span className="text-zinc-600 text-sm ml-1">{isOpen ? "▴" : "▾"}</span>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 pt-1 border-t border-zinc-800 bg-black/30">
                    {/* 신고 상세 */}
                    {r.description && (
                      <div className="mb-4 rounded bg-zinc-900 border border-zinc-800 p-3">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">신고 내용</p>
                        <p className="text-sm text-zinc-200 whitespace-pre-wrap">{r.description}</p>
                      </div>
                    )}
                    {r.resolved_note && (
                      <div className="mb-4 rounded bg-zinc-900 border border-zinc-800 p-3">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">처리 메모</p>
                        <p className="text-sm text-zinc-300 whitespace-pre-wrap">{r.resolved_note}</p>
                      </div>
                    )}

                    {wine ? (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[11px] text-zinc-500 uppercase tracking-wider">와인 편집 (final 필드)</p>
                          <Link
                            href={`/wines/${wine.id}`}
                            target="_blank"
                            className="text-[11px] text-sky-400 hover:text-sky-300 underline"
                          >
                            상세 페이지 ↗
                          </Link>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                          {FINAL_FIELDS.map(({ key, label, fallback }) => {
                            const fb = fallback?.(wine);
                            return (
                              <div key={key}>
                                <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                                  {label}
                                </label>
                                {key === "final_description" ? (
                                  <textarea
                                    value={editFields[key] ?? ""}
                                    onChange={(e) => setEditFields((p) => ({ ...p, [key]: e.target.value }))}
                                    placeholder={fb ?? ""}
                                    rows={3}
                                    className="w-full mt-0.5 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-200 resize-none"
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    value={editFields[key] ?? ""}
                                    onChange={(e) => setEditFields((p) => ({ ...p, [key]: e.target.value }))}
                                    placeholder={fb ?? ""}
                                    className="w-full mt-0.5 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-200"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Vivino 정보 */}
                        <div className="rounded bg-zinc-900 border border-zinc-800 p-3 mb-3">
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Vivino 매칭</p>
                          {wine.vivino_url ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              <a
                                href={wine.vivino_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-sky-400 hover:text-sky-300 underline break-all"
                              >
                                {wine.vivino_url}
                              </a>
                              {wine.vivino_rating && (
                                <span className="text-xs text-amber-400">★ {wine.vivino_rating}</span>
                              )}
                              <button
                                onClick={() => handleClearVivino(wine.id)}
                                disabled={savingWine === wine.id}
                                className="ml-auto text-xs px-2 py-1 rounded bg-rose-900/60 text-rose-300 hover:bg-rose-900/80 disabled:opacity-50"
                              >
                                Vivino 매칭 해제
                              </button>
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-500">매칭된 Vivino 정보 없음</p>
                          )}
                        </div>

                        {savedMsg && (
                          <p className={`text-xs mb-2 ${savedMsg.startsWith("오류") ? "text-rose-400" : "text-emerald-400"}`}>
                            {savedMsg}
                          </p>
                        )}

                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => handleSaveWine(wine.id)}
                            disabled={savingWine === wine.id}
                            className="px-3 py-1.5 rounded bg-emerald-700 text-white text-xs hover:bg-emerald-600 disabled:opacity-50"
                          >
                            {savingWine === wine.id ? "저장 중…" : "와인 정보 저장"}
                          </button>
                          <div className="ml-auto flex gap-2">
                            {r.status === "open" ? (
                              <>
                                <button
                                  onClick={() => handleResolve(r.id)}
                                  disabled={busyReport === r.id}
                                  className="px-3 py-1.5 rounded bg-sky-700 text-white text-xs hover:bg-sky-600 disabled:opacity-50"
                                >
                                  처리 완료
                                </button>
                                <button
                                  onClick={() => handleDismiss(r.id)}
                                  disabled={busyReport === r.id}
                                  className="px-3 py-1.5 rounded bg-zinc-700 text-zinc-300 text-xs hover:bg-zinc-600 disabled:opacity-50"
                                >
                                  기각
                                </button>
                                <button
                                  onClick={() => handleResolveAll(wine.id)}
                                  disabled={busyReport === wine.id}
                                  className="px-3 py-1.5 rounded bg-zinc-800 text-zinc-400 text-xs hover:bg-zinc-700 disabled:opacity-50"
                                  title="이 와인의 미처리 신고 일괄 처리"
                                >
                                  와인 전체 처리
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleReopen(r.id)}
                                disabled={busyReport === r.id}
                                className="px-3 py-1.5 rounded bg-zinc-700 text-zinc-300 text-xs hover:bg-zinc-600 disabled:opacity-50"
                              >
                                다시 열기
                              </button>
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-zinc-500 italic">와인이 이미 삭제되었습니다</p>
                        {r.status === "open" && (
                          <button
                            onClick={() => handleDismiss(r.id)}
                            className="px-3 py-1.5 rounded bg-zinc-700 text-zinc-300 text-xs hover:bg-zinc-600"
                          >
                            기각
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isPending && <p className="text-xs text-zinc-500 mt-4">업데이트 중…</p>}
    </div>
  );
}
