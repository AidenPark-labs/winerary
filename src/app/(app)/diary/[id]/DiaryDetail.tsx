"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import type { WineRecord } from "@/types";
import { resolveWineDisplay } from "@/lib/wine-display";
import DeleteButton from "./DeleteButton";
import ShareButton from "./ShareButton";

const TYPE_KO: Record<string, string> = {
  red: "레드", white: "화이트", rose: "로제",
  sparkling: "스파클링", fortified: "주정강화", other: "기타",
};

function renderStars(score: number, max = 5) {
  return Array.from({ length: max }, (_, i) => {
    const star = i + 1;
    const filled = score >= star;
    const half = !filled && score >= star - 0.5;
    return (
      <span key={i} className="relative text-sm w-4 h-4 inline-flex items-center justify-center">
        <span className="text-zinc-700">★</span>
        {filled && <span className="absolute inset-0 flex items-center justify-center text-amber-400">★</span>}
        {half && (
          <span className="absolute inset-0 flex items-center justify-center text-amber-400 overflow-hidden" style={{ clipPath: "inset(0 50% 0 0)" }}>★</span>
        )}
      </span>
    );
  });
}

interface WineData {
  id?: string;
  description?: string | null;
  vivino_url?: string | null;
  vivino_rating?: number | null;
  vivino_reviews?: number | null;
  vivino_winery?: string | null;
  vivino_grapes?: string | null;
  vivino_region?: string | null;
  vivino_style?: string | null;
  vivino_alcohol?: string | null;
  vivino_description?: string | null;
  grape_variety?: string | null;
  region?: string | null;
  country?: string | null;
  producer?: string | null;
  wine_type?: string | null;
  final_grapes?: string | null;
  final_region?: string | null;
  final_country?: string | null;
  final_producer?: string | null;
  final_wine_type?: string | null;
  final_alcohol?: string | null;
  final_style?: string | null;
  final_description?: string | null;
}

const WINE_TYPE_COLORS: Record<string, string> = {
  red: "bg-[#722F37]", white: "bg-[#F7E7CE]", rose: "bg-[#FFC0CB]",
  sparkling: "bg-[#F3E5AB]", fortified: "bg-[#4A0E4E]", other: "bg-zinc-400",
};

export default function DiaryDetail({ record, readOnly = false, wineData = null }: { record: WineRecord; readOnly?: boolean; wineData?: WineData | null }) {
  const photos: string[] = record.photos ?? [];
  const foods: { name: string }[] = (record.foods as { name: string }[]) ?? [];
  const companions: string[] = record.companions ?? [];
  const tags: string[] = record.tags ?? [];

  const [currentPhoto, setCurrentPhoto] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lbScrollRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lbRef = useCallback((node: HTMLDivElement | null) => {
    lbScrollRef.current = node;
    if (node && lightbox !== null) {
      node.scrollTo({ left: lightbox * node.clientWidth, behavior: "instant" });
    }
  }, [lightbox === null]);

  function handleScroll() {
    if (!scrollRef.current) return;
    const { scrollLeft, clientWidth } = scrollRef.current;
    setCurrentPhoto(Math.round(scrollLeft / clientWidth));
  }

  const bgPhoto = photos[currentPhoto] ?? photos[0];
  const hasPhoto = photos.length > 0;

  // 날짜 + 장소 텍스트
  const dateStr = new Date(record.drunk_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  const placeStr = record.place_name || record.location;

  // 가격 텍스트
  const priceText = record.price != null ? (() => {
    const unit = record.price_unit === "glass" ? "/잔" : record.price_type === "retail" ? " (소매)" : record.price_type === "market" ? " (매장)" : "";
    return `${record.price.toLocaleString()}원${unit}`;
  })() : null;

  // 종합 평점: 맛 + 가성비 + (음식이 있으면 음식궁합)
  const overallScore = (() => {
    const scores: number[] = [];
    if (record.rating != null) scores.push(Number(record.rating));
    if (record.value_score != null) scores.push(Number(record.value_score));
    if (foods.length > 0 && record.pairing_score != null) scores.push(Number(record.pairing_score));
    return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  })();

  return (
    <div className="relative min-h-screen bg-black">

      {/* ── 블러 배경 ── */}
      {bgPhoto && (
        <div className="fixed inset-0 z-0 pointer-events-none transition-all duration-1000 ease-out" aria-hidden="true">
          <img src={bgPhoto} alt="" className="w-full h-full object-cover scale-150 blur-3xl saturate-200 opacity-40 mix-blend-screen" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/70 to-black" />
        </div>
      )}

      <div className="relative z-10 flex flex-col min-h-screen">

        {/* ── 사진 히어로 ── */}
        <div className="relative overflow-visible">
          {hasPhoto ? (
            <>
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex snap-x snap-mandatory"
                style={{ overflowX: "scroll", overflowY: "hidden", scrollbarWidth: "none", touchAction: "pan-x pan-y" } as React.CSSProperties}
              >
                {photos.map((url, i) => (
                  <div key={i} className="relative flex-shrink-0 snap-center cursor-pointer" style={{ width: "100svw", height: "60vh" }} onClick={() => setLightbox(i)}>
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>

              <div className="absolute top-0 inset-x-0 h-36 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
              {/* 하단 → 사진 밖으로 확장되는 그라디언트 */}
              <div className="absolute inset-x-0 pointer-events-none" style={{ bottom: "-4rem", height: "12rem", background: "linear-gradient(to top, transparent 0%, rgba(0,0,0,0.9) 30%, rgba(0,0,0,0.6) 60%, transparent 100%)" }} />

              {photos.length > 1 && (
                <div className="absolute bottom-20 inset-x-0 flex justify-center gap-1.5 z-30 pointer-events-none">
                  {photos.map((_, i) => (
                    <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === currentPhoto ? "w-5 bg-white" : "w-1 bg-white/40"}`} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="relative bg-surface border-b border-white/5" style={{ height: "20vh" }}>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="w-16 h-16 rounded-full bg-white/5 border border-white/5 flex items-center justify-center">
                  <svg className="w-8 h-8 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                    <path d="M8 22h8M12 15v7M12 15a6 6 0 0 0 6-6V3H6v6a6 6 0 0 0 6 6z" />
                  </svg>
                </div>
              </div>
            </div>
          )}

          {/* 헤더 — 뒤로 / 수정 / 삭제 */}
          <div className="absolute top-0 inset-x-0 px-4 pt-12 flex items-center justify-between z-20 pointer-events-none">
            {readOnly ? (
              <span className="text-sm font-semibold text-white/70 tracking-widest">winerary</span>
            ) : (
              <a href="/diary" className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white text-lg hover:bg-black/60 transition-colors pointer-events-auto">←</a>
            )}
            {!readOnly && (
              <div className="flex items-center gap-2 pointer-events-auto">
                {record.visibility === "link" && <ShareButton id={record.id} />}
                <Link
                  href={`/diary/${record.id}/edit`}
                  className="text-xs font-medium px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-white hover:bg-white/20 transition-colors shadow-lg"
                >
                  수정
                </Link>
                <DeleteButton id={record.id} />
              </div>
            )}
          </div>
        </div>

        {/* ── 컨텐츠 ── */}
        <div className={`flex flex-col gap-4 px-4 relative z-20 ${hasPhoto ? "-mt-12" : "pt-4"} ${readOnly ? "pb-36" : "pb-28"}`}>

          {/* ── 글라스 카드 (별점 + 날짜 + 동행) ── */}
          <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 px-5 py-3.5 shadow-2xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              {overallScore != null && (
                <span className="text-amber-400 text-sm font-bold">★ {overallScore.toFixed(1)}</span>
              )}
              {overallScore != null && <span className="text-white/20">|</span>}
              <span className="text-sm text-white font-medium">{dateStr}</span>
            </div>
            {companions.length > 0 && (
              <span className="text-xs text-zinc-300/70 font-light">with {companions.join(", ")}</span>
            )}
          </div>

          {/* ━━━━━━━━━━ 1. Wine ━━━━━━━━━━ */}
          {(() => {
            const resolved = wineData ? resolveWineDisplay(wineData) : null;
            const displayType = resolved?.wine_type ?? record.wine_type;
            const displayGrapes = resolved?.grapes ?? record.grape_variety;
            const displayCountry = resolved?.country ?? record.wine_country;
            const hasWineScores = record.rating != null || record.value_score != null;

            const hasWineLink = !!(record.wine_id && wineData?.id);

            return (
              <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 overflow-hidden shadow-2xl">
                <div className="px-5 pt-4 pb-2">
                  <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">Wine</p>
                </div>
                {/* 와인명 */}
                {(() => {
                  const nameRow = (
                    <div className="flex items-center justify-between px-5 py-3">
                      <span className="text-xs text-zinc-400">와인명</span>
                      <div className="text-right min-w-0 flex-1 ml-4">
                        <p className="text-sm text-white font-medium truncate">{record.name}{record.wine_vintage ? ` ${record.wine_vintage}` : ""}</p>
                        {record.wine_name_original && (
                          <p className="text-[11px] text-zinc-400 italic truncate">{record.wine_name_original}</p>
                        )}
                      </div>
                      {hasWineLink && <span className="text-zinc-500 text-lg ml-2 flex-shrink-0">›</span>}
                    </div>
                  );
                  if (hasWineLink) return <Link href={`/wines/${record.wine_id}`}>{nameRow}</Link>;
                  return nameRow;
                })()}
                {/* 와인 세부 정보 */}
                <div className="flex flex-col divide-y divide-white/10">
                  {displayType && (
                    <div className="flex items-center justify-between px-5 py-3">
                      <span className="text-xs text-zinc-400">타입</span>
                      <span className="text-sm text-white font-medium">{TYPE_KO[displayType] ?? displayType}</span>
                    </div>
                  )}
                  {displayGrapes && (
                    <div className="flex items-center justify-between px-5 py-3">
                      <span className="text-xs text-zinc-400">품종</span>
                      <span className="text-sm text-white font-medium text-right">{displayGrapes}</span>
                    </div>
                  )}
                  {displayCountry && (
                    <div className="flex items-center justify-between px-5 py-3">
                      <span className="text-xs text-zinc-400">국가</span>
                      <span className="text-sm text-white font-medium">{displayCountry}</span>
                    </div>
                  )}
                  {resolved?.alcohol && (
                    <div className="flex items-center justify-between px-5 py-3">
                      <span className="text-xs text-zinc-400">도수</span>
                      <span className="text-sm text-white font-medium">{resolved.alcohol}</span>
                    </div>
                  )}
                </div>
                {/* 맛 평점 */}
                {record.rating != null && (
                  <div className="flex items-center justify-between px-5 py-3 border-t border-white/10">
                    <span className="text-xs text-zinc-400">맛 평점</span>
                    <div className="flex items-center gap-2">
                      <div className="flex">{renderStars(Number(record.rating), 5)}</div>
                      <span className="text-sm font-bold text-white">{Number(record.rating).toFixed(1)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ━━━━━━━━━━ 2. Pairing ━━━━━━━━━━ */}
          {(foods.length > 0 || record.pairing_score != null) && (
            <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 overflow-hidden shadow-2xl">
              <div className="px-5 pt-4 pb-2">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">Pairing</p>
              </div>
              {foods.length > 0 && (
                <div className="px-5 pb-3">
                  <div className="flex gap-1.5 flex-wrap">
                    {foods.map((f, i) => (
                      <span key={i} className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 text-zinc-200 text-sm font-light">{f.name}</span>
                    ))}
                  </div>
                </div>
              )}
              {/* 음식 궁합 점수 → 페어링에 대한 평가 */}
              {record.pairing_score != null && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-white/10">
                  <span className="text-xs text-zinc-400">음식 궁합</span>
                  <div className="flex items-center gap-2">
                    <div className="flex">{renderStars(record.pairing_score, 5)}</div>
                    <span className="text-sm font-bold text-white">{Number(record.pairing_score).toFixed(1)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ━━━━━━━━━━ 3. Experience ━━━━━━━━━━ */}
          {(priceText || placeStr || record.value_score != null) && (
            <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 overflow-hidden shadow-2xl divide-y divide-white/10">
              <div className="px-5 pt-4 pb-2">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">Experience</p>
              </div>
              {placeStr && (
                <div className="flex items-center justify-between px-5 py-3">
                  <span className="text-xs text-zinc-400">장소</span>
                  <span className="text-sm text-white font-medium text-right">{placeStr}</span>
                </div>
              )}
              {priceText && (
                <div className="flex items-center justify-between px-5 py-3">
                  <span className="text-xs text-zinc-400">가격</span>
                  <span className="text-sm text-white font-medium">{priceText}</span>
                </div>
              )}
              {record.value_score != null && (
                <div className="flex items-center justify-between px-5 py-3">
                  <span className="text-xs text-zinc-400">가성비</span>
                  <div className="flex items-center gap-2">
                    <div className="flex">{renderStars(Number(record.value_score), 5)}</div>
                    <span className="text-sm font-bold text-white">{Number(record.value_score).toFixed(1)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ━━━━━━━━━━ Verdict (메모 + 재구매) ━━━━━━━━━━ */}
          {(record.memo || record.repurchase_intent) && (
            <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 overflow-hidden shadow-2xl">
              <div className="px-5 pt-4 pb-2">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">Verdict</p>
              </div>
              {record.memo && (
                <div className="px-5 pb-4 relative">
                  <div className="absolute top-0 right-3 opacity-[0.05] pointer-events-none">
                    <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/></svg>
                  </div>
                  <p className="text-zinc-200 text-[15px] font-light leading-relaxed whitespace-pre-wrap relative z-10">{record.memo}</p>
                </div>
              )}
              {record.repurchase_intent && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-white/10">
                  <span className="text-xs text-zinc-400">재구매 의사</span>
                  <span className="text-sm font-medium text-white">
                    {{ yes: "👍 있음", maybe: "🤔 고민 중", no: "👋 패스" }[record.repurchase_intent]}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* 태그 */}
          {tags.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {tags.map((tag, i) => (
                <span key={i} className="px-2.5 py-1.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-300 text-[11px] font-medium">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* ── 풀스크린 라이트박스 ── */}
      {lightbox !== null && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col" onClick={() => setLightbox(null)}>
          <div
            ref={lbRef}
            className="flex-1 flex snap-x snap-mandatory overflow-x-auto"
            style={{ scrollbarWidth: "none", touchAction: "pan-x pan-y" } as React.CSSProperties}
            onClick={(e) => e.stopPropagation()}
            onScroll={() => {
              if (!lbScrollRef.current) return;
              const { scrollLeft, clientWidth } = lbScrollRef.current;
              setLightbox(Math.round(scrollLeft / clientWidth));
            }}
          >
            {photos.map((url, i) => (
              <div key={i} className="flex-shrink-0 snap-center w-full h-full flex items-center justify-center" style={{ minWidth: "100%" }}>
                <img src={url} alt="" className="max-w-full max-h-full object-contain" />
              </div>
            ))}
          </div>
          <div className="flex flex-col items-center gap-3 pb-24 pt-4">
            {photos.length > 1 && (
              <div className="flex justify-center gap-1.5">
                {photos.map((_, i) => (
                  <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === lightbox ? "w-5 bg-white" : "w-1 bg-white/40"}`} />
                ))}
              </div>
            )}
            <button className="text-white/70 hover:text-white text-sm px-5 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/10">
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
