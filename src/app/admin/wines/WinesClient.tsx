"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TYPE_KO: Record<string, string> = {
  red: "레드 🍷", white: "화이트 🥂", rose: "로제 🌸",
  sparkling: "스파클링 ✨", fortified: "주정강화 🏺", dessert: "디저트 🍯", other: "기타",
};

interface Wine {
  id: string;
  name_ko: string;
  name_en: string | null;
  wine_type: string | null;
  country: string | null;
  region: string | null;
  grape_variety: string | null;
  producer: string | null;
  description: string | null;
  price: number | null;
  naver_link: string | null;
  naver_image: string | null;
  vivino_url: string | null;
  vivino_rating: number | null;
  vivino_reviews: number | null;
  data_source: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  wines: Wine[];
  totalCount: number;
  page: number;
  totalPages: number;
}

function InfoCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold">{label}</span>
      <div className="text-zinc-200 text-sm mt-0.5">{children}</div>
    </div>
  );
}

export default function WinesClient({ wines, totalCount, page, totalPages }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  function goToPage(p: number) {
    router.push(`/admin/wines?page=${p}`);
  }

  const filtered = wines.filter((w) => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      w.name_ko.toLowerCase().includes(q) ||
      w.name_en?.toLowerCase().includes(q) ||
      w.producer?.toLowerCase().includes(q) ||
      w.country?.toLowerCase().includes(q) ||
      w.grape_variety?.toLowerCase().includes(q);
    const matchType = filterType === "all" || w.wine_type === filterType;
    return matchSearch && matchType;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">와인 DB</h1>
          <p className="text-zinc-500 text-sm mt-1">페이지 {page} / {totalPages} · 전체 {totalCount.toLocaleString()}개</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름, 생산자, 국가, 품종 검색…"
            className="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 w-64"
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
          >
            <option value="all">전체 타입</option>
            {Object.entries(TYPE_KO).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {filtered.map((w) => (
          <div
            key={w.id}
            className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden cursor-pointer hover:border-zinc-700 transition-colors"
            onClick={() => setExpanded(expanded === w.id ? null : w.id)}
          >
            {/* 카드 기본 뷰 */}
            <div className="flex items-center gap-4 p-4">
              {/* 썸네일 */}
              {w.naver_image ? (
                <img src={w.naver_image} alt={w.name_ko} className="w-14 h-14 rounded-xl object-cover flex-shrink-0 border border-zinc-700" />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-zinc-800 flex items-center justify-center flex-shrink-0 text-zinc-600 text-xl">🍷</div>
              )}

              {/* 기본 정보 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-zinc-100 truncate">{w.name_ko}</span>
                  {w.wine_type && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 flex-shrink-0">
                      {TYPE_KO[w.wine_type] ?? w.wine_type}
                    </span>
                  )}
                </div>
                {w.name_en && (
                  <p className="text-xs text-zinc-500 italic truncate">{w.name_en}</p>
                )}
                <div className="flex items-center gap-2 text-xs text-zinc-500 mt-1 flex-wrap">
                  {w.producer && <span className="bg-zinc-800/60 px-1.5 py-0.5 rounded">🏭 {w.producer}</span>}
                  {w.country && <span className="bg-zinc-800/60 px-1.5 py-0.5 rounded">📍 {w.country}{w.region ? ` · ${w.region}` : ""}</span>}
                  {w.grape_variety && <span className="bg-zinc-800/60 px-1.5 py-0.5 rounded">🍇 {w.grape_variety}</span>}
                </div>
              </div>

              {/* 우측 정보 */}
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                {w.vivino_rating && (
                  <div className="flex items-center gap-1">
                    <span className="text-amber-400 font-bold text-sm">★ {w.vivino_rating}</span>
                    {w.vivino_reviews && (
                      <span className="text-zinc-600 text-[10px]">({w.vivino_reviews.toLocaleString()})</span>
                    )}
                  </div>
                )}
                {w.price && (
                  <span className="text-zinc-400 text-sm">{w.price.toLocaleString()}원</span>
                )}
                <span className="text-zinc-600 text-[10px]">{expanded === w.id ? "▲ 접기" : "▼ 상세"}</span>
              </div>
            </div>

            {/* 확장 상세 */}
            {expanded === w.id && (
              <div className="border-t border-zinc-800 px-4 py-4 bg-zinc-900/50">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <InfoCell label="한국어명">{w.name_ko}</InfoCell>
                  {w.name_en && <InfoCell label="영문명">{w.name_en}</InfoCell>}
                  {w.wine_type && <InfoCell label="타입">{TYPE_KO[w.wine_type] ?? w.wine_type}</InfoCell>}
                  {w.producer && <InfoCell label="생산자">{w.producer}</InfoCell>}
                  {w.country && <InfoCell label="국가">{w.country}</InfoCell>}
                  {w.region && <InfoCell label="지역">{w.region}</InfoCell>}
                  {w.grape_variety && <InfoCell label="품종">{w.grape_variety}</InfoCell>}
                  {w.price != null && <InfoCell label="가격">{w.price.toLocaleString()}원</InfoCell>}
                  {w.vivino_rating != null && (
                    <InfoCell label="Vivino 평점">
                      <span className="text-amber-400">★ {w.vivino_rating}</span>
                      {w.vivino_reviews != null && <span className="text-zinc-500 ml-1">({w.vivino_reviews.toLocaleString()}개 리뷰)</span>}
                    </InfoCell>
                  )}
                  {w.data_source && <InfoCell label="데이터 출처">{w.data_source}</InfoCell>}
                  <InfoCell label="등록일">{new Date(w.created_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}</InfoCell>
                  <InfoCell label="수정일">{new Date(w.updated_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}</InfoCell>
                </div>

                {/* 외부 링크 */}
                {(w.vivino_url || w.naver_link) && (
                  <div className="flex gap-3 mt-4 pt-3 border-t border-zinc-800">
                    {w.vivino_url && (
                      <a href={w.vivino_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-colors"
                        onClick={(e) => e.stopPropagation()}>
                        Vivino에서 보기 →
                      </a>
                    )}
                    {w.naver_link && (
                      <a href={w.naver_link} target="_blank" rel="noopener noreferrer"
                        className="text-xs px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors"
                        onClick={(e) => e.stopPropagation()}>
                        네이버에서 보기 →
                      </a>
                    )}
                  </div>
                )}

                {/* 설명 */}
                {w.description && (
                  <div className="mt-4 pt-3 border-t border-zinc-800">
                    <span className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold">설명</span>
                    <p className="text-zinc-300 text-sm mt-1 whitespace-pre-wrap leading-relaxed">{w.description}</p>
                  </div>
                )}

                {/* 이미지 확대 */}
                {w.naver_image && (
                  <div className="mt-4 pt-3 border-t border-zinc-800">
                    <span className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold">이미지</span>
                    <img src={w.naver_image} alt={w.name_ko} className="mt-2 w-40 h-40 object-cover rounded-xl border border-zinc-700" />
                  </div>
                )}

                <p className="text-[10px] text-zinc-600 mt-4 font-mono select-all">ID: {w.id}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            className="px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-zinc-700 transition-colors"
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
                <span key={`dot-${i}`} className="text-zinc-600 px-1">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => goToPage(p)}
                  className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${p === page ? "bg-rose-500 text-white" : "bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700"}`}
                >
                  {p}
                </button>
              )
            )}
          <button
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages}
            className="px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-zinc-700 transition-colors"
          >
            다음 →
          </button>
        </div>
      )}
    </div>
  );
}
