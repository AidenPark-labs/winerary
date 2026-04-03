"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import type { WineRecord } from "@/types";
import DeleteButton from "./DeleteButton";
import ShareButton from "./ShareButton";

const TYPE_KO: Record<string, string> = {
  red: "레드 🍷", white: "화이트 🥂", rose: "로제 🌸",
  sparkling: "스파클링 ✨", fortified: "주정강화 🏺", other: "기타",
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

export default function DiaryDetail({ record, readOnly = false }: { record: WineRecord; readOnly?: boolean }) {
  const photos: string[] = record.photos ?? [];
  const foods: { name: string }[] = (record.foods as { name: string }[]) ?? [];
  const companions: string[] = record.companions ?? [];

  const [currentPhoto, setCurrentPhoto] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

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
        <div className="fixed inset-0 z-0 pointer-events-none transition-all duration-700" aria-hidden="true">
          <img src={bgPhoto} alt="" className="w-full h-full object-cover scale-125 blur-3xl saturate-200 opacity-25" />
          <div className="absolute inset-0 bg-black/60" />
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
                  <div key={i} className="relative flex-shrink-0 snap-center" style={{ width: "100svw", height: "68vh" }}>
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
            <div className="relative flex items-end px-5 pb-7" style={{ height: "42vh" }}>
              <div className="absolute inset-0 bg-gradient-to-br from-rose-950/60 via-zinc-900/40 to-black" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-7xl opacity-30">🍷</div>
              <div className="relative z-10">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h1 className="text-3xl font-bold text-white leading-tight">{record.name}</h1>
                  {record.wine_vintage && (
                    <span className="text-xl text-white/70 font-medium">{record.wine_vintage}</span>
                  )}
                </div>
                {record.wine_name_original && (
                  <p className="text-sm text-white/60 italic mt-0.5">{record.wine_name_original}</p>
                )}
                <p className="text-zinc-400 text-sm mt-1.5">
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
                  className="text-xs px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm text-zinc-300 hover:bg-black/60 transition-colors"
                >
                  수정
                </Link>
                <DeleteButton id={record.id} />
              </div>
            )}
          </div>
        </div>

        {/* ── 컨텐츠 영역 — 완전 블랙 배경 ── */}
        <div className={`flex flex-col gap-4 px-4 pt-5 bg-black ${readOnly ? "pb-36" : "pb-28"}`}>

          {/* 링크 공유 버튼 */}
          {!readOnly && record.visibility === "link" && (
            <ShareButton id={record.id} />
          )}

          {/* 와인 정보 태그 + Vivino */}
          <div className="flex flex-col gap-2">
            {(record.wine_type || record.wine_country || record.grape_variety) && (
              <div className="flex flex-wrap gap-2">
                {record.wine_type && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-zinc-300">
                    {TYPE_KO[record.wine_type] ?? record.wine_type}
                  </span>
                )}
                {record.wine_country && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-zinc-300">
                    📍 {record.wine_country}
                  </span>
                )}
                {record.grape_variety && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-zinc-300">
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
                className="self-start flex items-center gap-2 px-4 py-2 rounded-full border border-rose-800/60 bg-rose-950/30 text-rose-300 text-sm hover:bg-rose-900/40 transition-colors"
              >
                <span>🍇</span>
                Vivino에서 와인 보기 →
              </a>
            )}
          </div>

          {/* 평점 */}
          {(record.rating || record.pairing_score || record.price != null) && (
            <div className="grid grid-cols-2 gap-3">
              {record.rating && (
                <div className="flex flex-col items-center gap-1 py-4 rounded-2xl bg-white/5 border border-white/10">
                  <span className="text-2xl">⭐</span>
                  <div className="flex items-center gap-0.5">
                    {renderStars(Number(record.rating))}
                  </div>
                  <span className="text-xs text-zinc-500">와인 평점 {Number(record.rating).toFixed(1)}</span>
                </div>
              )}
              {record.pairing_score && (
                <div className="flex flex-col items-center gap-1 py-4 rounded-2xl bg-white/5 border border-white/10">
                  <span className="text-2xl">🍽️</span>
                  <div className="flex items-center gap-0.5">
                    {renderStars(record.pairing_score)}
                  </div>
                  <span className="text-xs text-zinc-500">음식 궁합 {record.pairing_score}/5</span>
                </div>
              )}
              {record.price != null && (
                <div className="flex flex-col items-center gap-1 py-4 rounded-2xl bg-white/5 border border-white/10">
                  <span className="text-2xl">💰</span>
                  <span className="text-lg font-bold text-white">{record.price.toLocaleString()}원</span>
                  <span className="text-xs text-zinc-500">구매 가격</span>
                </div>
              )}
              {record.value_score && (
                <div className="flex flex-col items-center gap-1 py-4 rounded-2xl bg-white/5 border border-white/10">
                  <span className="text-2xl">✨</span>
                  <div className="flex items-center gap-0.5">
                    {renderStars(Number(record.value_score))}
                  </div>
                  <span className="text-xs text-zinc-500">가성비 {Number(record.value_score).toFixed(1)}</span>
                </div>
              )}
            </div>
          )}

          {/* 페어링 음식 */}
          {foods.length > 0 && (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">페어링 음식</p>
              <div className="flex gap-2 flex-wrap">
                {foods.map((f, i) => (
                  <span key={i} className="px-3 py-1.5 rounded-full bg-white/10 text-zinc-200 text-sm">{f.name}</span>
                ))}
              </div>
            </div>
          )}

          {/* 함께한 사람 */}
          {companions.length > 0 && (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">함께한 사람</p>
              <p className="text-zinc-200 text-sm">{companions.join(", ")}</p>
            </div>
          )}

          {/* 메모 */}
          {record.memo && (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">메모</p>
              <p className="text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap">{record.memo}</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
