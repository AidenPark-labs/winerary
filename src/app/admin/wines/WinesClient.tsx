"use client";

import { useState } from "react";

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
  data_source: string | null;
  created_at: string;
}

interface Props {
  wines: Wine[];
  totalCount: number;
}

export default function WinesClient({ wines, totalCount }: Props) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = wines.filter((w) => {
    const matchSearch = !search ||
      w.name_ko.toLowerCase().includes(search.toLowerCase()) ||
      w.name_en?.toLowerCase().includes(search.toLowerCase()) ||
      w.producer?.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === "all" || w.wine_type === filterType;
    return matchSearch && matchType;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">와인 DB</h1>
          <p className="text-zinc-500 text-sm mt-1">표시 {filtered.length} / 전체 {totalCount.toLocaleString()}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름, 생산자 검색…"
            className="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 w-56"
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
            <div className="flex items-center gap-4 p-4">
              {/* 썸네일 */}
              {w.naver_image ? (
                <img src={w.naver_image} alt={w.name_ko} className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-zinc-700" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center flex-shrink-0 text-zinc-600 text-lg">🍷</div>
              )}

              {/* 기본 정보 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-zinc-100 truncate">{w.name_ko}</span>
                  {w.wine_type && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 flex-shrink-0">
                      {TYPE_KO[w.wine_type] ?? w.wine_type}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
                  {w.producer && <span>{w.producer}</span>}
                  {w.country && <span>{w.country}{w.region ? ` · ${w.region}` : ""}</span>}
                  {w.grape_variety && <span>🍇 {w.grape_variety}</span>}
                </div>
              </div>

              {/* 우측 정보 */}
              <div className="flex items-center gap-3 flex-shrink-0 text-sm">
                {w.vivino_rating && (
                  <span className="text-amber-400 font-semibold">★ {w.vivino_rating}</span>
                )}
                {w.price && (
                  <span className="text-zinc-400">{w.price.toLocaleString()}원</span>
                )}
                <span className="text-zinc-600 text-xs">{expanded === w.id ? "▲" : "▼"}</span>
              </div>
            </div>

            {/* 확장 상세 */}
            {expanded === w.id && (
              <div className="border-t border-zinc-800 px-4 py-4 bg-zinc-900/50">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {w.name_en && (
                    <div>
                      <span className="text-zinc-500 text-xs">영문명</span>
                      <p className="text-zinc-200">{w.name_en}</p>
                    </div>
                  )}
                  {w.data_source && (
                    <div>
                      <span className="text-zinc-500 text-xs">데이터 출처</span>
                      <p className="text-zinc-200">{w.data_source}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-zinc-500 text-xs">등록일</span>
                    <p className="text-zinc-200">{new Date(w.created_at).toLocaleDateString("ko-KR")}</p>
                  </div>
                  {w.vivino_url && (
                    <div>
                      <span className="text-zinc-500 text-xs">Vivino</span>
                      <p><a href={w.vivino_url} target="_blank" rel="noopener noreferrer" className="text-rose-400 hover:underline truncate block">링크 →</a></p>
                    </div>
                  )}
                  {w.naver_link && (
                    <div>
                      <span className="text-zinc-500 text-xs">네이버</span>
                      <p><a href={w.naver_link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate block">링크 →</a></p>
                    </div>
                  )}
                </div>
                {w.description && (
                  <div className="mt-3 pt-3 border-t border-zinc-800">
                    <span className="text-zinc-500 text-xs">설명</span>
                    <p className="text-zinc-300 text-sm mt-1 whitespace-pre-wrap leading-relaxed">{w.description}</p>
                  </div>
                )}
                <p className="text-[10px] text-zinc-600 mt-3 font-mono">{w.id}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
