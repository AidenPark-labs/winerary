"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import type { WineRecord } from "@/types";
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

export default function DiaryDetail({ record, readOnly = false, wineDescription }: { record: WineRecord; readOnly?: boolean; wineDescription?: string | null }) {
  const photos: string[] = record.photos ?? [];
  const foods: { name: string }[] = (record.foods as { name: string }[]) ?? [];
  const companions: string[] = record.companions ?? [];

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

  return (
    <div className="relative min-h-screen bg-black">

      {/* ── 블러 배경 (사진 컬러 확장) ── */}
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
                  <div key={i} className="relative flex-shrink-0 snap-center cursor-pointer" style={{ width: "100svw", height: "68vh" }} onClick={() => setLightbox(i)}>
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>

              <div className="absolute top-0 inset-x-0 h-36 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
              <div className="absolute bottom-0 inset-x-0 h-48 bg-gradient-to-t from-black to-transparent pointer-events-none" />

              {/* 와인 이름 + 빈티지 + 원본명 + 날짜 */}
              <div className="absolute bottom-0 inset-x-0 px-5 pb-7 z-10 pointer-events-none">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h1 className="text-3xl font-bold text-white leading-tight drop-shadow-lg">{record.name}</h1>
                  {record.wine_vintage && (
                    <span className="text-xl text-white/70 font-medium drop-shadow">{record.wine_vintage}</span>
                  )}
                </div>
                {record.wine_name_original && (
                  <p className="text-sm text-white/60 italic mt-0.5 drop-shadow">{record.wine_name_original}</p>
                )}
                <p className="text-zinc-400 text-sm mt-1.5 drop-shadow">
                  {new Date(record.drunk_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}
                  {record.location && ` · ${record.location}`}
                </p>
              </div>

              {photos.length > 1 && (
                <div className="absolute bottom-4 inset-x-0 flex justify-center gap-1.5 z-10 pointer-events-none">
                  {photos.map((_, i) => (
                    <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === currentPhoto ? "w-5 bg-white" : "w-1 bg-white/40"}`} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="relative flex items-end px-5 pb-7 bg-surface border-b border-white/5" style={{ height: "35vh" }}>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="w-20 h-20 rounded-full bg-white/5 border border-white/5 flex items-center justify-center">
                  <svg className="w-10 h-10 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                    <path d="M8 22h8M12 15v7M12 15a6 6 0 0 0 6-6V3H6v6a6 6 0 0 0 6 6z" />
                  </svg>
                </div>
              </div>
              <div className="relative z-10 w-full">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h1 className="text-3xl font-serif font-medium text-white leading-tight drop-shadow-lg">{record.name}</h1>
                  {record.wine_vintage && (
                    <span className="text-xl text-white/70 font-light drop-shadow">{record.wine_vintage}</span>
                  )}
                </div>
                {record.wine_name_original && (
                  <p className="text-sm text-white/60 italic mt-0.5 drop-shadow font-light">{record.wine_name_original}</p>
                )}
                <p className="text-zinc-400 text-sm mt-1.5 drop-shadow font-light">
                  {new Date(record.drunk_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}
                  {record.location && ` · ${record.location}`}
                </p>
              </div>
            </div>
          )}

          {/* 헤더 — 뒤로 / 수정 / 삭제 (또는 공유 브랜딩) */}
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

        {/* ── 컨텐츠 영역 — 벤토 그리드 레이아웃 ── */}
        <div className={`flex flex-col gap-5 px-4 pt-6 bg-transparent relative z-20 ${readOnly ? "pb-36" : "pb-28"}`}>

          {/* 링크 공유 버튼 */}
          {!readOnly && record.visibility === "link" && (
            <ShareButton id={record.id} />
          )}

          {/* 와인 정보 태그 + Vivino */}
          <div className="flex flex-col gap-3">
            {(record.wine_type || record.wine_country || record.grape_variety) && (
              <div className="flex flex-wrap gap-2">
                {record.wine_type && (
                  <span className="text-xs font-medium px-3 py-1.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/5 text-white shadow-sm">
                    {TYPE_KO[record.wine_type] ?? record.wine_type}
                  </span>
                )}
                {record.wine_country && (
                  <span className="text-xs font-light px-3 py-1.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/5 text-zinc-300 shadow-sm flex items-center gap-1">
                    📍 {record.wine_country}
                  </span>
                )}
                {record.grape_variety && (
                  <span className="text-xs font-light px-3 py-1.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/5 text-zinc-300 shadow-sm flex items-center gap-1">
                    🍇 {record.grape_variety}
                  </span>
                )}
              </div>
            )}
            {record.wine_vivino_url && (
              <a
                href={record.wine_vivino_url}
                target="_blank"
                rel="noopener noreferrer"
                className="self-start flex items-center gap-2 px-5 py-2.5 rounded-2xl border border-white/10 bg-surface/50 backdrop-blur-xl hover:bg-white/10 text-white text-sm transition-all shadow-lg active:scale-95"
              >
                <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
                Vivino에서 정보 보기 →
              </a>
            )}
          </div>

          {/* ── 벤토 그리드 통계 패널 ── */}
          <div className="grid grid-cols-2 gap-3 mt-2">
            {/* 1. 종합 평점 (Full Width Bento) */}
            {(record.rating || record.value_score || record.pairing_score) && (() => {
              const scores = [record.rating, record.value_score, record.pairing_score].filter((v): v is number => v != null);
              const avg = scores.length ? scores.reduce((a, b) => a + Number(b), 0) / scores.length : null;
              if (avg == null) return null;
              return (
                <div className="col-span-2 flex items-center justify-between p-6 rounded-[28px] bg-surface/80 border border-white/5 shadow-2xl backdrop-blur-2xl relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-accent/10 to-transparent pointer-events-none" />
                  <div className="flex flex-col relative z-10 gap-2">
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Overall Score</span>
                    <div className="flex items-center gap-1">{renderStars(avg, 5)}</div>
                  </div>
                  <span className="text-5xl font-serif font-bold text-white tracking-tighter relative z-10 drop-shadow-lg p-1">{avg.toFixed(1)}</span>
                </div>
              );
            })()}

            {/* 2. 세부 지표 (Columns) */}
            <div className="col-span-2 grid grid-cols-3 gap-2 p-2 rounded-[28px] bg-black/40 border border-white/5 backdrop-blur-xl shadow-inner">
              {record.rating && (
                <div className="flex flex-col items-center justify-center py-5 px-2 rounded-[20px] bg-surface/60 border border-white/5 shadow-md">
                  <span className="text-[9px] font-semibold text-zinc-500 tracking-[0.2em] mb-1.5 uppercase">Taste</span>
                  <span className="text-xl font-bold text-white">{Number(record.rating).toFixed(1)}</span>
                </div>
              )}
              {record.value_score && (
                <div className="flex flex-col items-center justify-center py-5 px-2 rounded-[20px] bg-surface/60 border border-white/5 shadow-md">
                  <span className="text-[9px] font-semibold text-zinc-500 tracking-[0.2em] mb-1.5 uppercase">Value</span>
                  <span className="text-xl font-bold text-white">{Number(record.value_score).toFixed(1)}</span>
                </div>
              )}
              {record.pairing_score && (
                <div className="flex flex-col items-center justify-center py-5 px-2 rounded-[20px] bg-surface/60 border border-white/5 shadow-md">
                  <span className="text-[9px] font-semibold text-zinc-500 tracking-[0.2em] mb-1.5 uppercase">Pairing</span>
                  <span className="text-xl font-bold text-white">{record.pairing_score}</span>
                </div>
              )}
            </div>

            {/* 3. 구매 가격 */}
            {record.price != null && (
              <div className="col-span-2 flex items-center justify-between p-5 rounded-3xl bg-surface/60 border border-white/5 backdrop-blur-xl shadow-lg mt-1">
                <span className="text-xs font-medium text-zinc-400 tracking-wider">구매 가격</span>
                <span className="text-xl font-serif font-bold text-white">
                  {record.price.toLocaleString()}
                  <span className="text-sm font-light text-zinc-500 ml-1 tracking-widest">KRW</span>
                </span>
              </div>
            )}
          </div>

          {/* 페어링 음식 */}
          {foods.length > 0 && (
            <div className="rounded-3xl bg-surface/40 backdrop-blur-xl border border-white/5 p-5 shadow-lg mt-2">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em] mb-3">Pairing Food</p>
              <div className="flex gap-2 flex-wrap">
                {foods.map((f, i) => (
                  <span key={i} className="px-4 py-2 rounded-2xl bg-white/5 border border-white/5 text-zinc-200 text-sm font-light shadow-sm tracking-wide">{f.name}</span>
                ))}
              </div>
            </div>
          )}

          {/* 함께한 사람 */}
          {companions.length > 0 && (
            <div className="rounded-3xl bg-surface/40 backdrop-blur-xl border border-white/5 p-5 shadow-lg mt-1">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em] mb-2">Companions</p>
              <p className="text-zinc-200 text-sm font-light tracking-wide">{companions.join(", ")}</p>
            </div>
          )}

          {/* 메모 */}
          {record.memo && (
            <div className="rounded-3xl bg-surface/60 backdrop-blur-2xl border border-white/5 p-6 shadow-xl mt-1 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/></svg>
              </div>
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em] mb-3 relative z-10">Tasting Note</p>
              <p className="text-zinc-200 text-[15px] font-light leading-relaxed whitespace-pre-wrap relative z-10 tracking-wide">{record.memo}</p>
            </div>
          )}

          {/* 와인 설명 */}
          {wineDescription && (
            <div className="rounded-3xl bg-surface/40 backdrop-blur-xl border border-white/5 p-6 shadow-lg mt-2">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em] mb-3">About This Wine</p>
              <p className="text-zinc-300 text-sm font-light leading-relaxed whitespace-pre-wrap tracking-wide">{wineDescription}</p>
            </div>
          )}
        </div>

      </div>

      {/* ── 풀스크린 라이트박스 ── */}
      {lightbox !== null && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col" onClick={() => setLightbox(null)}>
          {/* 사진 스와이프 */}
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

          {/* 인디케이터 + 닫기 버튼 */}
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
