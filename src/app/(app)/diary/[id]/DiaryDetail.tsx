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

/* ── 컴팩트 와인 카드: 간략 정보 + 탭하면 와인 상세 ── */
function WineCard({ record, wineData }: { record: WineRecord; wineData: WineData | null }) {
  const resolved = wineData ? resolveWineDisplay(wineData) : null;
  const displayType = resolved?.wine_type ?? record.wine_type;
  const displayGrapes = resolved?.grapes ?? record.grape_variety;
  const displayCountry = resolved?.country ?? record.wine_country;
  const hasWineId = !!(record.wine_id && wineData?.id);

  const chips = [
    displayType && (TYPE_KO[displayType] ?? displayType),
    displayCountry,
    displayGrapes,
    resolved?.alcohol,
  ].filter(Boolean);

  if (chips.length === 0 && !wineData?.vivino_rating) return null;

  const inner = (
    <div className="rounded-2xl bg-surface/50 backdrop-blur-xl border border-white/5 px-4 py-3.5 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c, i) => (
            <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-white/8 text-zinc-300 border border-white/5">{c}</span>
          ))}
        </div>
        {wineData?.vivino_rating != null && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-amber-400 text-xs font-medium">★ {wineData.vivino_rating}</span>
            {wineData.vivino_reviews != null && (
              <span className="text-zinc-600 text-[10px]">({wineData.vivino_reviews.toLocaleString()})</span>
            )}
          </div>
        )}
      </div>
      {hasWineId && (
        <span className="text-zinc-500 text-lg flex-shrink-0">›</span>
      )}
    </div>
  );

  if (hasWineId) {
    return <Link href={`/wines/${record.wine_id}`}>{inner}</Link>;
  }
  return inner;
}

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

  // 평점 계산
  const scores = [record.rating, record.value_score, record.pairing_score].filter((v): v is number => v != null);
  const avg = scores.length ? scores.reduce((a, b) => a + Number(b), 0) / scores.length : null;

  // 가격 텍스트
  const priceText = record.price != null ? (() => {
    const unit = record.price_unit === "glass" ? "/잔" : record.price_type === "retail" ? " (소매)" : record.price_type === "market" ? " (매장)" : "";
    return `${record.price.toLocaleString()}원${unit}`;
  })() : null;

  return (
    <div className="relative min-h-screen bg-black">

      {/* ── 블러 배경 ── */}
      {bgPhoto && (
        <div className="fixed inset-0 z-0 pointer-events-none transition-all duration-1000 ease-out" aria-hidden="true">
          <img src={bgPhoto} alt="" className="w-full h-full object-cover scale-150 blur-3xl saturate-200 opacity-40 mix-blend-screen" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/60 to-black" />
        </div>
      )}

      <div className="relative z-10 flex flex-col min-h-screen">

        {/* ── 사진 히어로 ── */}
        <div className="relative">
          {hasPhoto ? (
            <>
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex snap-x snap-mandatory"
                style={{ overflowX: "scroll", scrollbarWidth: "none", touchAction: "pan-x pan-y" } as React.CSSProperties}
              >
                {photos.map((url, i) => (
                  <div key={i} className="relative flex-shrink-0 snap-center cursor-pointer" style={{ width: "100svw", height: "60vh" }} onClick={() => setLightbox(i)}>
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>

              <div className="absolute top-0 inset-x-0 h-36 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
              <div className="absolute bottom-0 inset-x-0 h-48 bg-gradient-to-t from-black to-transparent pointer-events-none" />

              {/* 와인 이름 오버레이 */}
              <div className="absolute bottom-0 inset-x-0 px-5 pb-6 z-10 pointer-events-none">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h1 className="text-3xl font-bold text-white leading-tight drop-shadow-lg">{record.name}</h1>
                  {record.wine_vintage && (
                    <span className="text-xl text-white/70 font-medium drop-shadow">{record.wine_vintage}</span>
                  )}
                </div>
                {record.wine_name_original && (
                  <p className="text-sm text-white/60 italic mt-0.5 drop-shadow">{record.wine_name_original}</p>
                )}
              </div>

              {photos.length > 1 && (
                <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5 z-10 pointer-events-none">
                  {photos.map((_, i) => (
                    <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === currentPhoto ? "w-5 bg-white" : "w-1 bg-white/40"}`} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="relative flex items-end px-5 pb-6 bg-surface border-b border-white/5" style={{ height: "30vh" }}>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="w-20 h-20 rounded-full bg-white/5 border border-white/5 flex items-center justify-center">
                  <svg className="w-10 h-10 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                    <path d="M8 22h8M12 15v7M12 15a6 6 0 0 0 6-6V3H6v6a6 6 0 0 0 6 6z" />
                  </svg>
                </div>
              </div>
              <div className="relative z-10 w-full">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h1 className="text-3xl font-bold text-white leading-tight">{record.name}</h1>
                  {record.wine_vintage && (
                    <span className="text-xl text-white/70 font-light">{record.wine_vintage}</span>
                  )}
                </div>
                {record.wine_name_original && (
                  <p className="text-sm text-white/60 italic mt-0.5">{record.wine_name_original}</p>
                )}
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
        <div className={`flex flex-col gap-4 px-4 pt-5 bg-transparent relative z-20 ${readOnly ? "pb-36" : "pb-28"}`}>

          {/* 날짜 · 장소 */}
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <span>{dateStr}</span>
            {placeStr && (
              <>
                <span className="text-zinc-600">·</span>
                <span className="truncate">{placeStr}</span>
              </>
            )}
          </div>

          {/* 링크 공유 버튼 */}
          {!readOnly && record.visibility === "link" && (
            <ShareButton id={record.id} />
          )}

          {/* 와인 카드 (컴팩트) */}
          <WineCard record={record} wineData={wineData} />

          {/* ── 테이스팅 노트 (핵심 컨텐츠) ── */}
          {record.memo && (
            <div className="rounded-2xl bg-surface/60 backdrop-blur-2xl border border-white/5 p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-3 opacity-[0.06] pointer-events-none">
                <svg className="w-14 h-14 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/></svg>
              </div>
              <p className="text-zinc-200 text-[15px] font-light leading-relaxed whitespace-pre-wrap relative z-10">{record.memo}</p>
            </div>
          )}

          {/* ── 평점 ── */}
          {avg != null && (
            <div className="rounded-2xl bg-surface/60 backdrop-blur-2xl border border-white/5 overflow-hidden">
              {/* 종합 */}
              <div className="flex items-center justify-between p-5 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-accent/8 to-transparent pointer-events-none" />
                <div className="flex flex-col relative z-10 gap-1.5">
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">My Rating</span>
                  <div className="flex items-center gap-1">{renderStars(avg, 5)}</div>
                </div>
                <span className="text-4xl font-bold text-white relative z-10">{avg.toFixed(1)}</span>
              </div>
              {/* 세부 */}
              <div className="grid grid-cols-3 border-t border-white/5">
                {record.rating != null && (
                  <div className="flex flex-col items-center py-4 border-r border-white/5 last:border-r-0">
                    <span className="text-[9px] font-semibold text-zinc-500 tracking-widest uppercase mb-1">Taste</span>
                    <span className="text-lg font-bold text-white">{Number(record.rating).toFixed(1)}</span>
                  </div>
                )}
                {record.value_score != null && (
                  <div className="flex flex-col items-center py-4 border-r border-white/5 last:border-r-0">
                    <span className="text-[9px] font-semibold text-zinc-500 tracking-widest uppercase mb-1">Value</span>
                    <span className="text-lg font-bold text-white">{Number(record.value_score).toFixed(1)}</span>
                  </div>
                )}
                {record.pairing_score != null && (
                  <div className="flex flex-col items-center py-4">
                    <span className="text-[9px] font-semibold text-zinc-500 tracking-widest uppercase mb-1">Pairing</span>
                    <span className="text-lg font-bold text-white">{record.pairing_score}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 경험 정보 그리드 ── */}
          {(priceText || record.repurchase_intent || foods.length > 0 || companions.length > 0) && (
            <div className="rounded-2xl bg-surface/40 backdrop-blur-xl border border-white/5 overflow-hidden divide-y divide-white/5">
              {/* 가격 + 재구매 */}
              {(priceText || record.repurchase_intent) && (
                <div className="flex divide-x divide-white/5">
                  {priceText && (
                    <div className="flex-1 px-4 py-3.5">
                      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.12em] mb-1">Price</p>
                      <p className="text-sm text-white font-medium">{priceText}</p>
                    </div>
                  )}
                  {record.repurchase_intent && (
                    <div className="flex-1 px-4 py-3.5">
                      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.12em] mb-1">Repurchase</p>
                      <p className="text-sm text-white font-medium">
                        {{ yes: "👍 재구매 의사 있음", maybe: "🤔 고민 중", no: "👋 다음에는 패스" }[record.repurchase_intent]}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* 페어링 음식 */}
              {foods.length > 0 && (
                <div className="px-4 py-3.5">
                  <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.12em] mb-2">Food Pairing</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {foods.map((f, i) => (
                      <span key={i} className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 text-zinc-200 text-sm font-light">{f.name}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* 함께한 사람 */}
              {companions.length > 0 && (
                <div className="px-4 py-3.5">
                  <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.12em] mb-1">Companions</p>
                  <p className="text-zinc-200 text-sm font-light">{companions.join(", ")}</p>
                </div>
              )}
            </div>
          )}

          {/* 태그 */}
          {tags.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {tags.map((tag, i) => (
                <span key={i} className="px-3 py-1.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-light">
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
