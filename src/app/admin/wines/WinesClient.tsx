"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateWine, updateWineVivino, deleteWine } from "./actions";
import { resolveWineDisplay } from "@/lib/wine-display";
import type { VivinoCrawlResult, VivinoCrawlError } from "@/lib/vivino-crawler";
import { ChevronIcon } from "@/components/Icons";
import { getWineImage } from "@/lib/wine-placeholder";

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
  vivino_page_url: string | null;
  vivino_rating: number | null;
  vivino_reviews: number | null;
  vivino_winery: string | null;
  vivino_grapes: string | null;
  vivino_region: string | null;
  vivino_style: string | null;
  vivino_alcohol: string | null;
  vivino_allergens: string | null;
  vivino_description: string | null;
  final_grapes: string | null;
  final_region: string | null;
  final_country: string | null;
  final_producer: string | null;
  final_wine_type: string | null;
  final_alcohol: string | null;
  final_style: string | null;
  final_description: string | null;
  data_source: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  wines: Wine[];
  totalCount: number;
  page: number;
  totalPages: number;
  search: string;
  filterType: string;
  vivinoFilter: string;
}

function InfoCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold">{label}</span>
      <div className="text-zinc-200 text-sm mt-0.5">{children}</div>
    </div>
  );
}

export default function WinesClient({ wines, totalCount, page, totalPages, search: initialSearch, filterType: initialType, vivinoFilter: initialVivino }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [filterType, setFilterType] = useState(initialType);
  const [vivinoFilter, setVivinoFilter] = useState(initialVivino);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [crawling, setCrawling] = useState<string | null>(null);
  const [crawlResult, setCrawlResult] = useState<Record<string, VivinoCrawlResult | VivinoCrawlError | null>>({});
  const [crawlSaving, setCrawlSaving] = useState(false);
  const [urlInput, setUrlInput] = useState<string | null>(null); // wine id가 키, null이면 입력 모드 아님
  const [urlInputValue, setUrlInputValue] = useState("");

  const FINAL_SCHEMA: { key: keyof Wine; label: string; placeholder: (w: Wine) => string }[] = [
    { key: "final_wine_type", label: "타입", placeholder: (w) => w.wine_type || "" },
    { key: "final_grapes", label: "품종", placeholder: (w) => w.vivino_grapes || w.grape_variety || "" },
    { key: "final_country", label: "국가", placeholder: (w) => w.country || "" },
    { key: "final_region", label: "지역", placeholder: (w) => w.vivino_region || w.region || "" },
    { key: "final_producer", label: "생산자", placeholder: (w) => w.vivino_winery || w.producer || "" },
    { key: "final_alcohol", label: "도수", placeholder: (w) => w.vivino_alcohol || "" },
    { key: "final_style", label: "스타일", placeholder: (w) => w.vivino_style || "" },
    { key: "final_description", label: "설명", placeholder: (w) => (w.vivino_description || w.description || "").slice(0, 60) },
  ];

  function startEdit(w: Wine) {
    setEditing(w.id);
    const fields: Record<string, string> = {};
    for (const { key } of FINAL_SCHEMA) {
      const val = w[key];
      fields[key] = val != null ? String(val) : "";
    }
    setEditFields(fields);
    setSaveMsg(null);
  }

  async function handleSave(id: string) {
    setSaving(true);
    setSaveMsg(null);
    const data: Record<string, string | null> = {};
    for (const { key } of FINAL_SCHEMA) {
      const raw = editFields[key]?.trim();
      data[key] = raw || null;
    }
    const result = await updateWine(id, data);
    setSaving(false);
    if (result.error) {
      setSaveMsg(`오류: ${result.error}`);
    } else {
      setSaveMsg("저장 완료");
      setEditing(null);
      router.refresh();
    }
  }

  async function handleCrawl(w: Wine, vivinoUrl?: string) {
    setCrawling(w.id);
    setCrawlResult((prev) => ({ ...prev, [w.id]: null }));
    setUrlInput(null);
    try {
      const body = vivinoUrl
        ? { vivinoUrl }
        : { wineName: w.name_en || w.name_ko };
      const res = await fetch("/api/admin/vivino/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setCrawlResult((prev) => ({ ...prev, [w.id]: data }));
    } catch {
      setCrawlResult((prev) => ({ ...prev, [w.id]: { success: false as const, error: "네트워크 오류", step: "browser" as const } }));
    }
    setCrawling(null);
  }

  function startUrlInput(wineId: string) {
    setUrlInput(wineId);
    setUrlInputValue("");
  }

  async function handleCrawlApply(wineId: string) {
    const result = crawlResult[wineId];
    if (!result || !result.success) return;
    setCrawlSaving(true);
    const r = result as VivinoCrawlResult;
    const res = await updateWineVivino(wineId, {
      vivino_url: r.vivinoUrl,
      vivino_page_url: r.vivinoUrl,
      vivino_wine_id: r.vivinoWineId,
      vivino_rating: r.rating,
      vivino_reviews: r.reviews,
      vivino_winery: r.facts.winery || null,
      vivino_grapes: r.facts.grapes || null,
      vivino_region: r.facts.region || null,
      vivino_style: r.facts.style || null,
      vivino_alcohol: r.facts.alcohol || null,
      vivino_allergens: r.facts.allergens || null,
      vivino_description: r.facts.description || null,
    });
    setCrawlSaving(false);
    if (res.error) {
      alert(`업데이트 실패: ${res.error}`);
    } else {
      setCrawlResult((prev) => { const next = { ...prev }; delete next[wineId]; return next; });
      router.refresh();
    }
  }

  function handleCrawlCancel(wineId: string) {
    setCrawlResult((prev) => { const next = { ...prev }; delete next[wineId]; return next; });
  }

  function navigate(overrides: { page?: number; q?: string; type?: string; vivino?: string }) {
    const params = new URLSearchParams();
    const q = overrides.q ?? search;
    const type = overrides.type ?? filterType;
    const viv = overrides.vivino ?? vivinoFilter;
    const p = overrides.page ?? 1;
    if (q) params.set("q", q);
    if (type && type !== "all") params.set("type", type);
    if (viv && viv !== "all") params.set("vivino", viv);
    if (p > 1) params.set("page", String(p));
    router.push(`/admin/wines${params.toString() ? `?${params}` : ""}`);
  }

  function handleSearch() {
    navigate({ q: search, page: 1 });
  }

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
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="이름, 생산자, 국가, 품종 검색…"
            className="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 w-64"
          />
          <button
            onClick={handleSearch}
            className="px-3 py-2 rounded-lg bg-rose-500 text-white text-sm font-medium hover:bg-rose-600 transition-colors"
          >
            검색
          </button>
          <select
            value={vivinoFilter}
            onChange={(e) => { setVivinoFilter(e.target.value); navigate({ vivino: e.target.value, page: 1 }); }}
            className="rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
          >
            <option value="all">Vivino 전체</option>
            <option value="has_both">평점+URL 있음</option>
            <option value="has_rating">평점만 있음</option>
            <option value="has_url">URL만 있음</option>
            <option value="no_rating">평점 없음</option>
            <option value="no_url">URL 없음</option>
          </select>
          <select
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); navigate({ type: e.target.value, page: 1 }); }}
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
        {wines.map((w) => (
          <div
            key={w.id}
            className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden cursor-pointer hover:border-zinc-700 transition-colors"
            onClick={() => setExpanded(expanded === w.id ? null : w.id)}
          >
            {/* 카드 기본 뷰 */}
            <div className="flex items-center gap-4 p-4">
              {/* 썸네일 */}
              <img src={getWineImage(w.naver_image, w.wine_type)} alt={w.name_ko} className="w-14 h-14 rounded-xl object-cover flex-shrink-0 border border-zinc-700" />

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
                <span className="text-zinc-600 text-[10px] inline-flex items-center gap-0.5"><ChevronIcon size={10} direction={expanded === w.id ? "up" : "down"} />{expanded === w.id ? "접기" : "상세"}</span>
              </div>
            </div>

            {/* 확장 상세 */}
            {expanded === w.id && (
              <div className="border-t border-zinc-800 px-4 py-4 bg-zinc-900/50">
                {/* 최종 표시값 */}
                {(() => {
                  const d = resolveWineDisplay(w);
                  return (
                    <div className="mb-4 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                      <p className="text-[10px] font-semibold text-emerald-400/70 uppercase tracking-wider mb-2">최종 표시값</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                        {d.wine_type && <span className="text-zinc-300"><span className="text-zinc-500 text-xs">종류</span> {TYPE_KO[d.wine_type] ?? d.wine_type}</span>}
                        {d.grapes && <span className="text-zinc-300"><span className="text-zinc-500 text-xs">품종</span> {d.grapes}</span>}
                        {d.country && <span className="text-zinc-300"><span className="text-zinc-500 text-xs">국가</span> {d.country}</span>}
                        {d.region && <span className="text-zinc-300"><span className="text-zinc-500 text-xs">지역</span> {d.region}</span>}
                        {d.producer && <span className="text-zinc-300"><span className="text-zinc-500 text-xs">생산자</span> {d.producer}</span>}
                        {d.alcohol && <span className="text-zinc-300"><span className="text-zinc-500 text-xs">도수</span> {d.alcohol}</span>}
                        {d.style && <span className="text-zinc-300"><span className="text-zinc-500 text-xs">스타일</span> {d.style}</span>}
                      </div>
                    </div>
                  );
                })()}

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

                {/* Vivino 편집 */}
                <div className="mt-4 pt-3 border-t border-zinc-800" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold">Vivino 정보</span>
                    {editing !== w.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCrawl(w)}
                          disabled={crawling === w.id}
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-purple-500/15 text-purple-400 border border-purple-500/30 hover:bg-purple-500/25 transition-colors disabled:opacity-50"
                        >
                          {crawling === w.id ? "수집 중…" : "이름으로 수집"}
                        </button>
                        <button
                          onClick={() => startUrlInput(w.id)}
                          disabled={crawling === w.id}
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 transition-colors disabled:opacity-50"
                        >
                          URL로 수집
                        </button>
                        <button onClick={() => startEdit(w)} className="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors">
                          오버라이드
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {saveMsg && <span className="text-[11px] text-emerald-400">{saveMsg}</span>}
                        <button onClick={() => setEditing(null)} className="text-[11px] px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700">취소</button>
                        <button onClick={() => handleSave(w.id)} disabled={saving} className="text-[11px] px-2.5 py-1 rounded-lg bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50">
                          {saving ? "저장중…" : "저장"}
                        </button>
                      </div>
                    )}
                  </div>

                  {editing === w.id ? (
                    <div>
                      <p className="text-[10px] text-zinc-400 mb-2">비워두면 자동 선택 (Vivino &gt; 네이버), 입력하면 수동 오버라이드</p>
                      <div className="grid grid-cols-2 gap-2">
                        {FINAL_SCHEMA.map(({ key, label, placeholder }) => (
                          <div key={key} className={key === "final_description" || key === "final_region" ? "col-span-2" : ""}>
                            <label className="text-zinc-500 text-[10px]">{label}</label>
                            <input
                              value={editFields[key] ?? ""}
                              onChange={(e) => setEditFields((prev) => ({ ...prev, [key]: e.target.value }))}
                              placeholder={placeholder(w)}
                              className="w-full mt-0.5 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5 text-sm">
                      <div className="flex items-start gap-2">
                        <span className="text-zinc-500 text-xs w-20 flex-shrink-0 pt-0.5">URL</span>
                        {(w.vivino_page_url || w.vivino_url) ? (
                          <a href={w.vivino_page_url || w.vivino_url!} target="_blank" rel="noopener noreferrer" className="text-rose-400 hover:underline truncate">{w.vivino_page_url || w.vivino_url}</a>
                        ) : (
                          <span className="text-zinc-600 italic">없음</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500 text-xs w-20 flex-shrink-0">평점</span>
                        {w.vivino_rating != null ? (
                          <span className="text-amber-400">★ {w.vivino_rating}{w.vivino_reviews != null && <span className="text-zinc-500 ml-1">({w.vivino_reviews.toLocaleString()}개 리뷰)</span>}</span>
                        ) : (
                          <span className="text-zinc-600 italic">없음</span>
                        )}
                      </div>
                      {w.vivino_winery && (
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500 text-xs w-20 flex-shrink-0">Winery</span>
                          <span className="text-zinc-200">{w.vivino_winery}</span>
                        </div>
                      )}
                      {w.vivino_grapes && (
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500 text-xs w-20 flex-shrink-0">Grapes</span>
                          <span className="text-zinc-200">{w.vivino_grapes}</span>
                        </div>
                      )}
                      {w.vivino_region && (
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500 text-xs w-20 flex-shrink-0">Region</span>
                          <span className="text-zinc-200">{w.vivino_region}</span>
                        </div>
                      )}
                      {w.vivino_style && (
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500 text-xs w-20 flex-shrink-0">Style</span>
                          <span className="text-zinc-200">{w.vivino_style}</span>
                        </div>
                      )}
                      {w.vivino_alcohol && (
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500 text-xs w-20 flex-shrink-0">Alcohol</span>
                          <span className="text-zinc-200">{w.vivino_alcohol}</span>
                        </div>
                      )}
                      {w.vivino_allergens && (
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500 text-xs w-20 flex-shrink-0">Allergens</span>
                          <span className="text-zinc-200">{w.vivino_allergens}</span>
                        </div>
                      )}
                      {w.vivino_description && (
                        <div className="flex items-start gap-2 mt-1">
                          <span className="text-zinc-500 text-xs w-20 flex-shrink-0 pt-0.5">Description</span>
                          <p className="text-zinc-300 text-xs leading-relaxed">{w.vivino_description}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* URL 직접 입력 */}
                  {urlInput === w.id && (
                    <div className="mt-3 pt-3 border-t border-zinc-700 flex items-center gap-2">
                      <input
                        value={urlInputValue}
                        onChange={(e) => setUrlInputValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && urlInputValue.trim()) handleCrawl(w, urlInputValue.trim());
                        }}
                        placeholder="https://www.vivino.com/w/..."
                        className="flex-1 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200"
                        autoFocus
                      />
                      <button
                        onClick={() => urlInputValue.trim() && handleCrawl(w, urlInputValue.trim())}
                        className="text-[11px] px-3 py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                      >
                        수집
                      </button>
                      <button
                        onClick={() => setUrlInput(null)}
                        className="text-[11px] px-2.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700"
                      >
                        취소
                      </button>
                    </div>
                  )}

                  {/* 수집 결과 미리보기 */}
                  {crawlResult[w.id] && (
                    <div className="mt-3 pt-3 border-t border-zinc-700">
                      {crawlResult[w.id]!.success ? (() => {
                        const r = crawlResult[w.id] as VivinoCrawlResult;
                        return (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-emerald-400 text-xs font-semibold">수집 완료 — {r.vivinoName}</span>
                              <div className="flex items-center gap-2">
                                {r.matchInfo && (
                                  <span className="text-[10px] text-zinc-500">
                                    매칭 {(r.matchInfo.firstMatchScore * 100).toFixed(0)}% · 교차 {(r.matchInfo.crossMatchScore * 100).toFixed(0)}% · 후보 {r.matchInfo.candidateCount}개
                                  </span>
                                )}
                                <button onClick={() => handleCrawlCancel(w.id)} className="text-[11px] px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700">
                                  취소
                                </button>
                                <button onClick={() => handleCrawlApply(w.id)} disabled={crawlSaving} className="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50">
                                  {crawlSaving ? "저장 중…" : "업데이트"}
                                </button>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                              {[
                                ["URL", r.vivinoUrl, w.vivino_page_url || w.vivino_url],
                                ["평점", r.rating != null ? `★ ${r.rating}` : null, w.vivino_rating != null ? `★ ${w.vivino_rating}` : null],
                                ["리뷰", r.reviews != null ? `${r.reviews.toLocaleString()}개` : null, w.vivino_reviews != null ? `${w.vivino_reviews.toLocaleString()}개` : null],
                                ["Winery", r.facts.winery, w.vivino_winery],
                                ["Grapes", r.facts.grapes, w.vivino_grapes],
                                ["Region", r.facts.region, w.vivino_region],
                                ["Style", r.facts.style, w.vivino_style],
                                ["Alcohol", r.facts.alcohol, w.vivino_alcohol],
                                ["Allergens", r.facts.allergens, w.vivino_allergens],
                              ].filter(([, newVal]) => newVal).map(([label, newVal, oldVal]) => (
                                <div key={label as string} className="flex items-start gap-2">
                                  <span className="text-zinc-500 text-xs w-16 flex-shrink-0 pt-0.5">{label}</span>
                                  <div className="min-w-0">
                                    <span className="text-emerald-300 text-xs break-all">{newVal}</span>
                                    {oldVal && oldVal !== newVal && (
                                      <span className="text-zinc-600 text-[10px] block line-through truncate">{oldVal}</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                            {r.facts.description && (
                              <div className="mt-2 flex items-start gap-2">
                                <span className="text-zinc-500 text-xs w-16 flex-shrink-0 pt-0.5">Desc</span>
                                <p className="text-emerald-300/80 text-[11px] leading-relaxed">{r.facts.description.substring(0, 200)}{r.facts.description.length > 200 ? "…" : ""}</p>
                              </div>
                            )}
                          </div>
                        );
                      })() : (
                        <div className="flex items-center justify-between">
                          <span className="text-red-400 text-xs">
                            수집 실패: {(crawlResult[w.id] as VivinoCrawlError).error}
                          </span>
                          <button onClick={() => handleCrawlCancel(w.id)} className="text-[11px] px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700">
                            닫기
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 네이버 링크 */}
                {w.naver_link && (
                  <div className="mt-3 pt-3 border-t border-zinc-800">
                    <a href={w.naver_link} target="_blank" rel="noopener noreferrer"
                      className="text-xs px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors"
                      onClick={(e) => e.stopPropagation()}>
                      네이버에서 보기 →
                    </a>
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

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-800" onClick={(e) => e.stopPropagation()}>
                  <p className="text-[10px] text-zinc-600 font-mono select-all">ID: {w.id}</p>
                  <button
                    onClick={async () => {
                      if (!confirm(`"${w.name_ko}" 를 정말 삭제하시겠습니까?`)) return;
                      const result = await deleteWine(w.id);
                      if (result.error) alert(`삭제 실패: ${result.error}`);
                      else router.refresh();
                    }}
                    className="text-[11px] px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                  >
                    삭제
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => navigate({ page: page - 1 })}
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
                  onClick={() => navigate({ page: p })}
                  className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${p === page ? "bg-rose-500 text-white" : "bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700"}`}
                >
                  {p}
                </button>
              )
            )}
          <button
            onClick={() => navigate({ page: page + 1 })}
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
