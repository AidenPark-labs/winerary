import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { resolveWineDisplay } from "@/lib/wine-display";
import VivinoRating from "./VivinoRating";
import WineActions from "./WineActions";
import BackButton from "./BackButton";

const TYPE_KO: Record<string, string> = {
  red: "레드", white: "화이트", rose: "로제",
  sparkling: "스파클링", fortified: "주정강화", dessert: "디저트", other: "기타",
};

export default async function WineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: wine } = await supabase
    .from("wines")
    .select("*")
    .eq("id", id)
    .single();

  if (!wine) notFound();

  const d = resolveWineDisplay(wine);

  // 같은 타입/국가의 유사 와인 추천
  const { data: similar } = await supabase
    .from("wines")
    .select("id, name_ko, wine_type, country, price, vivino_rating, naver_image")
    .neq("id", id)
    .eq("wine_type", wine.wine_type)
    .not("price", "is", null)
    .order("vivino_rating", { ascending: false, nullsFirst: false })
    .limit(5);

  const hasImage = !!wine.naver_image;

  return (
    <div className="relative min-h-screen bg-black">

      {/* ── 블러 배경 ── */}
      {hasImage && (
        <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
          <img src={wine.naver_image} alt="" className="w-full h-full object-cover scale-150 blur-3xl saturate-200 opacity-30 mix-blend-screen" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/70 to-black" />
        </div>
      )}

      <div className="relative z-10 flex flex-col min-h-screen">

        {/* ── 이미지 히어로 ── */}
        <div className="relative overflow-visible">
          {hasImage ? (
            <>
              <div className="flex items-center justify-center bg-zinc-900/50" style={{ height: "50vh" }}>
                <img src={wine.naver_image} alt={wine.name_ko} className="w-full h-full object-contain" />
              </div>
              <div className="absolute top-0 inset-x-0 h-36 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
              <div className="absolute inset-x-0 pointer-events-none" style={{ bottom: "-4rem", height: "12rem", background: "linear-gradient(to top, transparent 0%, rgba(0,0,0,0.9) 30%, rgba(0,0,0,0.6) 60%, transparent 100%)" }} />
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

          {/* 헤더 — 뒤로가기 */}
          <div className="absolute top-0 inset-x-0 px-4 pt-12 flex items-center z-20 pointer-events-none">
            <div className="pointer-events-auto">
              <BackButton />
            </div>
          </div>
        </div>

        {/* ── 컨텐츠 ── */}
        <div className={`flex flex-col gap-4 px-4 relative z-20 ${hasImage ? "-mt-12" : "pt-4"} pb-28`}>

          {/* ── 이름 카드 ── */}
          <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 px-5 py-4 shadow-2xl flex flex-col gap-2">
            <h2 className="text-xl font-bold text-white">{wine.name_ko}</h2>
            {wine.name_en && (
              <p className="text-sm text-zinc-400 italic">{wine.name_en}</p>
            )}
            {(d.producer || d.country) && (
              <p className="text-xs text-zinc-500 font-light">
                {[d.producer, d.country, d.region].filter(Boolean).join(" · ")}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5 mt-1">
              {d.wine_type && (
                <span className="text-xs px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-zinc-300 font-light">
                  {TYPE_KO[d.wine_type] ?? d.wine_type}
                </span>
              )}
              {d.grapes && (
                <span className="text-xs px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-zinc-300 font-light">
                  🍇 {d.grapes}
                </span>
              )}
            </div>
          </div>

          {/* ── 가격 + Vivino ── */}
          <div className="flex items-center gap-3">
            {wine.price && (
              <div className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-xl">
                <span className="text-emerald-400 font-bold text-lg">{wine.price.toLocaleString()}원</span>
                <span className="text-emerald-400/50 text-xs ml-1">750ml</span>
              </div>
            )}
            <VivinoRating
              wineId={wine.id}
              nameEn={wine.name_en}
              initialRating={wine.vivino_rating}
              initialReviews={wine.vivino_reviews}
              initialPageUrl={wine.vivino_page_url}
            />
          </div>

          {/* ── Wine Details ── */}
          {(d.style || d.alcohol || d.region || d.producer) && (
            <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 overflow-hidden shadow-2xl">
              <div className="px-5 pt-4 pb-2">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">Wine Details</p>
              </div>
              <div className="flex flex-col pb-2">
                {d.producer && (
                  <div className="flex items-center justify-between px-5 py-2">
                    <span className="text-xs text-zinc-400">와이너리</span>
                    <span className="text-sm text-white font-medium">{d.producer}</span>
                  </div>
                )}
                {d.region && (
                  <div className="flex items-start justify-between gap-4 px-5 py-2">
                    <span className="text-xs text-zinc-400 flex-shrink-0 pt-0.5">지역</span>
                    <span className="text-sm text-white font-medium text-right">{d.region}</span>
                  </div>
                )}
                {d.style && (
                  <div className="flex items-center justify-between px-5 py-2">
                    <span className="text-xs text-zinc-400">스타일</span>
                    <span className="text-sm text-white font-medium">{d.style}</span>
                  </div>
                )}
                {d.alcohol && (
                  <div className="flex items-center justify-between px-5 py-2">
                    <span className="text-xs text-zinc-400">도수</span>
                    <span className="text-sm text-white font-medium">{d.alcohol}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 설명 ── */}
          {d.description && !/예상됩니다|추정됩니다|부족하/.test(d.description) && (
            <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 overflow-hidden shadow-2xl">
              <div className="px-5 pt-4 pb-2">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">Description</p>
              </div>
              <div className="px-5 pb-4">
                <p className="text-sm text-zinc-300 font-light leading-relaxed">{d.description}</p>
              </div>
            </div>
          )}

          {/* ── 외부 링크 ── */}
          {wine.naver_link && (
            <a href={wine.naver_link} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-xl text-emerald-300 text-sm hover:bg-emerald-500/15 transition-colors">
              💰 네이버에서 구매하기
            </a>
          )}

          {/* ── 액션 버튼 ── */}
          <WineActions wine={wine} />

          {/* ── 유사 와인 ── */}
          {similar && similar.length > 0 && (
            <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 overflow-hidden shadow-2xl">
              <div className="px-5 pt-4 pb-2">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">Similar Wines</p>
              </div>
              <div className="px-4 pb-4 flex flex-col gap-2">
                {similar.map((w) => (
                  <Link
                    key={w.id}
                    href={`/wines/${w.id}`}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] transition-colors"
                  >
                    {w.naver_image && (
                      <img src={w.naver_image} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-zinc-700" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200 truncate">{w.name_ko}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500">
                        {w.price && <span className="text-emerald-400">{w.price.toLocaleString()}원</span>}
                        {w.vivino_rating && <span className="text-purple-300">★ {Number(w.vivino_rating).toFixed(1)}</span>}
                        {w.country && <span>{w.country}</span>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
