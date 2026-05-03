"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getWineImage } from "@/lib/wine-placeholder";

const TYPE_KO: Record<string, string> = {
  red: "레드 🍷",
  white: "화이트 🥂",
  rose: "로제 🌸",
  sparkling: "스파클링 ✨",
  fortified: "주정강화 🏺",
  dessert: "디저트 🍯",
  other: "기타",
};

// wines_with_vivino view 행 (v5 스키마)
export interface WineRow {
  id: string;
  source: string;
  source_refs: string[] | null;
  created_at: string;
  updated_at: string;
  name_ko: string;
  name_en: string;
  wine_type: string;
  wine_style: string | null;
  country_ko: string;
  region_ko: string | null;
  producer: string | null;
  grape_varieties: string[] | null;
  grape_blend: unknown | null;
  alcohol: number | null;
  brand: string | null;
  price: number | null;
  description: string | null;
  image_url: string | null;
  is_published: boolean;
  needs_review: boolean;
  needs_review_reasons: string[] | null;
  locked_fields: string[] | null;
  // vivino_wines LEFT JOIN
  vivino_url: string | null;
  vivino_wine_id: string | null;
  vivino_name: string | null;
  vivino_rating: number | null;
  vivino_reviews: number | null;
  vivino_winery: string | null;
  vivino_grapes: string | null;
  vivino_region: string | null;
  vivino_style: string | null;
  vivino_alcohol: string | null;
  vivino_description: string | null;
  vivino_image_url: string | null;
  vivino_needs_review: boolean | null;
  vivino_reviewed_at: string | null;
  vivino_match_score: number | null;
}

export type ReviewBadgeMap = Record<string, { reports: number; dedupe: number; vivinoDup: number }>;

interface Props {
  wines: WineRow[];
  badges: ReviewBadgeMap;
  totalCount: number;
  page: number;
  totalPages: number;
  search: string;
  filterType: string;
  vivinoFilter: string;
  reviewFilter: string;
  counts: {
    needs_review: number;
    vivino_unreviewed: number;
    open_reports: number;
    pending_dedupe: number;
  };
}

export default function WineDbClient({
  wines,
  badges,
  totalCount,
  page,
  totalPages,
  search: initialSearch,
  filterType: initialType,
  vivinoFilter: initialVivino,
  reviewFilter: initialReview,
  counts,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [filterType, setFilterType] = useState(initialType);
  const [vivinoFilter, setVivinoFilter] = useState(initialVivino);
  const [reviewFilter, setReviewFilter] = useState(initialReview);

  function navigate(overrides: { page?: number; q?: string; type?: string; vivino?: string; review?: string }) {
    const params = new URLSearchParams();
    const q = overrides.q ?? search;
    const type = overrides.type ?? filterType;
    const viv = overrides.vivino ?? vivinoFilter;
    const rev = overrides.review ?? reviewFilter;
    const p = overrides.page ?? 1;
    if (q) params.set("q", q);
    if (type && type !== "all") params.set("type", type);
    if (viv && viv !== "all") params.set("vivino", viv);
    if (rev && rev !== "all") params.set("review", rev);
    if (p > 1) params.set("page", String(p));
    router.push(`/admin/wine-db${params.toString() ? `?${params}` : ""}`);
  }

  const REVIEW_TABS: Array<{ key: string; label: string; count: number; tone: string }> = [
    { key: "all", label: "전체", count: totalCount, tone: "zinc" },
    { key: "needs_review", label: "변환 검수", count: counts.needs_review, tone: "amber" },
    { key: "vivino_unreviewed", label: "Vivino 미검수", count: counts.vivino_unreviewed, tone: "purple" },
    { key: "pending_dedupe", label: "중복 후보", count: counts.pending_dedupe, tone: "blue" },
    { key: "open_reports", label: "미해결 신고", count: counts.open_reports, tone: "rose" },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">와인 DB</h1>
        <p className="text-zinc-500 text-sm mt-1">
          페이지 {page} / {totalPages} · 결과 {totalCount.toLocaleString()}개
        </p>
      </div>

      {/* 검수 탭 */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {REVIEW_TABS.map((t) => {
          const active = reviewFilter === t.key;
          const toneClasses: Record<string, string> = {
            zinc: active ? "bg-zinc-700 text-zinc-100 border-zinc-600" : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700",
            amber: active ? "bg-amber-500/20 text-amber-200 border-amber-500/40" : "bg-zinc-900 text-amber-400/80 border-zinc-800 hover:border-amber-500/30",
            purple: active ? "bg-purple-500/20 text-purple-200 border-purple-500/40" : "bg-zinc-900 text-purple-400/80 border-zinc-800 hover:border-purple-500/30",
            blue: active ? "bg-blue-500/20 text-blue-200 border-blue-500/40" : "bg-zinc-900 text-blue-400/80 border-zinc-800 hover:border-blue-500/30",
            rose: active ? "bg-rose-500/20 text-rose-200 border-rose-500/40" : "bg-zinc-900 text-rose-400/80 border-zinc-800 hover:border-rose-500/30",
          };
          return (
            <button
              key={t.key}
              onClick={() => {
                setReviewFilter(t.key);
                navigate({ review: t.key, page: 1 });
              }}
              className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${toneClasses[t.tone]}`}
            >
              {t.label}
              <span className="ml-2 text-xs opacity-70">{t.count.toLocaleString()}</span>
            </button>
          );
        })}
      </div>

      {/* 검색·필터 행 */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && navigate({ q: search, page: 1 })}
          placeholder="이름·생산자·브랜드 검색…"
          className="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 w-72"
        />
        <button
          onClick={() => navigate({ q: search, page: 1 })}
          className="px-3 py-2 rounded-lg bg-rose-500 text-white text-sm font-medium hover:bg-rose-600"
        >
          검색
        </button>
        <select
          value={filterType}
          onChange={(e) => {
            setFilterType(e.target.value);
            navigate({ type: e.target.value, page: 1 });
          }}
          className="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
        >
          <option value="all">전체 타입</option>
          {Object.entries(TYPE_KO).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={vivinoFilter}
          onChange={(e) => {
            setVivinoFilter(e.target.value);
            navigate({ vivino: e.target.value, page: 1 });
          }}
          className="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
        >
          <option value="all">Vivino 전체</option>
          <option value="linked">연결됨</option>
          <option value="unlinked">미연결</option>
          <option value="reviewed">검수 완료</option>
        </select>
      </div>

      {/* 카드 리스트 */}
      <div className="flex flex-col gap-2">
        {wines.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-10 text-center text-zinc-500">
            결과가 없습니다.
          </div>
        ) : (
          wines.map((w) => {
            const b = badges[w.id] ?? { reports: 0, dedupe: 0, vivinoDup: 0 };
            const grapesText = w.grape_varieties?.length ? w.grape_varieties.join(", ") : null;
            return (
              <div
                key={w.id}
                onClick={() => router.push(`/admin/wine-db/${w.id}`)}
                className="rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors cursor-pointer overflow-hidden"
              >
                <div className="flex items-center gap-4 p-4">
                  <img
                    src={getWineImage(w.image_url ?? w.vivino_image_url, w.wine_type)}
                    alt={w.name_ko}
                    className="w-14 h-14 rounded-xl object-cover flex-shrink-0 border border-zinc-700"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-zinc-100 truncate">{w.name_ko}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 flex-shrink-0">
                        {TYPE_KO[w.wine_type] ?? w.wine_type}
                      </span>
                      {!w.is_published && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">비공개</span>
                      )}
                      {/* 검수 배지 */}
                      {w.needs_review && (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30"
                          title={w.needs_review_reasons?.join(", ") ?? ""}
                        >
                          변환검수
                        </span>
                      )}
                      {w.vivino_url && !w.vivino_reviewed_at && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
                          Vivino미검수
                        </span>
                      )}
                      {b.dedupe > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">
                          중복후보 {b.dedupe}
                        </span>
                      )}
                      {b.reports > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
                          신고 {b.reports}
                        </span>
                      )}
                      {b.vivinoDup > 1 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/30">
                          URL중복 {b.vivinoDup}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 italic truncate">{w.name_en}</p>
                    <div className="flex items-center gap-2 text-xs text-zinc-500 mt-1 flex-wrap">
                      {w.producer && <span className="bg-zinc-800/60 px-1.5 py-0.5 rounded">🏭 {w.producer}</span>}
                      <span className="bg-zinc-800/60 px-1.5 py-0.5 rounded">
                        📍 {w.country_ko}
                        {w.region_ko ? ` · ${w.region_ko}` : ""}
                      </span>
                      {grapesText && <span className="bg-zinc-800/60 px-1.5 py-0.5 rounded">🍇 {grapesText}</span>}
                      {w.alcohol != null && (
                        <span className="bg-zinc-800/60 px-1.5 py-0.5 rounded">🍷 {w.alcohol}%</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {w.vivino_rating != null && (
                      <div className="flex items-center gap-1">
                        <span className="text-amber-400 font-bold text-sm">★ {w.vivino_rating}</span>
                        {w.vivino_reviews != null && (
                          <span className="text-zinc-600 text-[10px]">({w.vivino_reviews.toLocaleString()})</span>
                        )}
                      </div>
                    )}
                    {w.price != null && (
                      <span className="text-zinc-400 text-sm">{w.price.toLocaleString()}원</span>
                    )}
                    <span className="text-zinc-600 text-[10px]">{w.source}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => navigate({ page: page - 1 })}
            disabled={page <= 1}
            className="px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-zinc-700"
          >
            ← 이전
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
            .reduce<(number | "…")[]>((acc, p, i, arr) => {
              if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
              acc.push(p);
              return acc;
            }, [])
            .map((p, i) =>
              p === "…" ? (
                <span key={`dot-${i}`} className="text-zinc-600 px-1">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  onClick={() => navigate({ page: p })}
                  className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                    p === page
                      ? "bg-rose-500 text-white"
                      : "bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                  }`}
                >
                  {p}
                </button>
              ),
            )}
          <button
            onClick={() => navigate({ page: page + 1 })}
            disabled={page >= totalPages}
            className="px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-zinc-700"
          >
            다음 →
          </button>
        </div>
      )}
    </div>
  );
}
