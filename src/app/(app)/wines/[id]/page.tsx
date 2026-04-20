import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { resolveWineDisplay } from "@/lib/wine-display";
import VivinoRating from "./VivinoRating";
import WineActions from "./WineActions";
import BackButton from "./BackButton";
import NaverShopping from "./NaverShopping";
import { getWineImage } from "@/lib/wine-placeholder";

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

  // 유사 와인 추천: 같은 국가+품종 > 같은 국가 > 같은 타입, 비슷한 가격대
  const similarFields = "id, name_ko, wine_type, country, country_ko, price, vivino_rating, naver_image, image_url, grape_variety, grape_varieties, grape_varieties_ko, final_grapes, vivino_grapes";
  const priceMin = wine.price ? Math.round(wine.price * 0.5) : null;
  const priceMax = wine.price ? Math.round(wine.price * 1.5) : null;

  let similar: typeof tier1 = [];

  // 1순위: 같은 타입 + 같은 국가 + 비슷한 가격대
  let q1 = supabase
    .from("wines")
    .select(similarFields)
    .neq("id", id)
    .eq("wine_type", wine.wine_type)
    .eq("country", d.country ?? "")
    .order("vivino_rating", { ascending: false, nullsFirst: false })
    .limit(20);
  if (priceMin && priceMax) q1 = q1.gte("price", priceMin).lte("price", priceMax);
  const { data: tier1 } = await q1;

  if (tier1 && tier1.length > 0) {
    // 품종이 겹치는 것을 먼저, 나머지는 Vivino 평점순
    const wineGrapes = (d.grapes ?? "").toLowerCase();
    similar = tier1.sort((a, b) => {
      const aGrapes = ((a.grape_varieties_ko ?? []).join(" ") || (a.grape_varieties ?? []).join(" ") || a.final_grapes || a.vivino_grapes || a.grape_variety || "").toLowerCase();
      const bGrapes = ((b.grape_varieties_ko ?? []).join(" ") || (b.grape_varieties ?? []).join(" ") || b.final_grapes || b.vivino_grapes || b.grape_variety || "").toLowerCase();
      const aMatch = wineGrapes && aGrapes.includes(wineGrapes) ? 1 : 0;
      const bMatch = wineGrapes && bGrapes.includes(wineGrapes) ? 1 : 0;
      if (aMatch !== bMatch) return bMatch - aMatch;
      return (Number(b.vivino_rating) || 0) - (Number(a.vivino_rating) || 0);
    }).slice(0, 5);
  }

  // 부족하면 같은 타입에서 추가 충당
  if (similar.length < 5) {
    const existingIds = new Set(similar.map((w) => w.id));
    existingIds.add(id);
    const { data: fallback } = await supabase
      .from("wines")
      .select(similarFields)
      .eq("wine_type", wine.wine_type)
      .not("id", "in", `(${[...existingIds].join(",")})`)
      .not("price", "is", null)
      .order("vivino_rating", { ascending: false, nullsFirst: false })
      .limit(5 - similar.length);
    if (fallback) similar = [...similar, ...fallback];
  }

  const heroImage = getWineImage(wine.image_url ?? wine.naver_image, wine.wine_type);

  return (
    <div className="relative min-h-screen bg-black">

      {/* ── 블러 배경 ── */}
      <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
        <img src={heroImage} alt="" className="w-full h-full object-cover scale-150 blur-3xl saturate-200 opacity-30 mix-blend-screen" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/70 to-black" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">

        {/* ── 이미지 히어로 ── */}
        <div className="relative overflow-visible">
          <div className="flex items-center justify-center" style={{ height: "50vh" }}>
            <img src={heroImage} alt={wine.name_ko} className="w-full h-full object-contain" />
          </div>
          <div className="absolute top-0 inset-x-0 h-36 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 pointer-events-none bg-background" style={{ height: "50%", maskImage: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.02) 15%, rgba(0,0,0,0.06) 25%, rgba(0,0,0,0.15) 35%, rgba(0,0,0,0.3) 45%, rgba(0,0,0,0.5) 55%, rgba(0,0,0,0.7) 65%, rgba(0,0,0,0.85) 75%, rgba(0,0,0,0.94) 85%, rgba(0,0,0,0.98) 92%, rgba(0,0,0,1) 100%)", WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.02) 15%, rgba(0,0,0,0.06) 25%, rgba(0,0,0,0.15) 35%, rgba(0,0,0,0.3) 45%, rgba(0,0,0,0.5) 55%, rgba(0,0,0,0.7) 65%, rgba(0,0,0,0.85) 75%, rgba(0,0,0,0.94) 85%, rgba(0,0,0,0.98) 92%, rgba(0,0,0,1) 100%)" } as React.CSSProperties} />

          {/* 헤더 — 뒤로가기 */}
          <div className="absolute top-0 inset-x-0 px-4 pt-12 flex items-center z-20 pointer-events-none">
            <div className="pointer-events-auto">
              <BackButton />
            </div>
          </div>
        </div>

        {/* ── 컨텐츠 ── */}
        <div className="flex flex-col gap-4 px-4 relative z-20 pb-16" style={{ marginTop: "-5vh" }}>

          {/* ── 이름 카드 ── */}
          <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 px-5 py-4 shadow-2xl flex flex-col gap-1">
            <h2 className="text-xl font-bold text-white">{wine.name_ko}</h2>
            {wine.name_en && (
              <p className="text-sm text-zinc-400 italic">{wine.name_en}</p>
            )}
          </div>

          {/* ── Wine Details ── */}
          <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 overflow-hidden shadow-2xl">
            <div className="px-5 pt-4 pb-2">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">와인 상세</p>
            </div>
            <div className="flex flex-col pb-2">
              {d.wine_type && (
                <div className="flex items-center justify-between px-5 py-2">
                  <span className="text-xs text-zinc-400">타입</span>
                  <span className="text-sm text-white font-medium">{TYPE_KO[d.wine_type] ?? d.wine_type}</span>
                </div>
              )}
              {d.grapes && (
                <div className="flex items-start justify-between gap-4 px-5 py-2">
                  <span className="text-xs text-zinc-400 flex-shrink-0 pt-0.5">품종</span>
                  <span className="text-sm text-white font-medium text-right">{d.grapes}</span>
                </div>
              )}
              {d.country && (
                <div className="flex items-center justify-between px-5 py-2">
                  <span className="text-xs text-zinc-400">국가</span>
                  <span className="text-sm text-white font-medium">{d.country}</span>
                </div>
              )}
              {d.region && (
                <div className="flex items-start justify-between gap-4 px-5 py-2">
                  <span className="text-xs text-zinc-400 flex-shrink-0 pt-0.5">지역</span>
                  <span className="text-sm text-white font-medium text-right">{d.region}</span>
                </div>
              )}
              {d.producer && (
                <div className="flex items-center justify-between px-5 py-2">
                  <span className="text-xs text-zinc-400">와이너리</span>
                  <span className="text-sm text-white font-medium">{d.producer}</span>
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
              {/* Vivino 별점 */}
              <VivinoRating
                wineId={wine.id}
                nameEn={wine.name_en}
                initialRating={wine.vivino_rating}
                initialReviews={wine.vivino_reviews}
                initialPageUrl={wine.vivino_page_url}
              />
            </div>
          </div>

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

          {/* ── 네이버 쇼핑 검색 ── */}
          <NaverShopping query={wine.name_ko} wineId={wine.id} />

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
                    <img src={getWineImage(w.image_url ?? w.naver_image, w.wine_type)} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-zinc-700" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200 truncate">{w.name_ko}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500">
                        {w.price && <span className="text-emerald-400">{w.price.toLocaleString()}원</span>}
                        {w.vivino_rating && <span className="text-rose-300">★ {Number(w.vivino_rating).toFixed(1)}</span>}
                        {(w.country_ko ?? w.country) && <span>{w.country_ko ?? w.country}</span>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* ── 액션 버튼 ── */}
          <WineActions wine={wine} />

          {/* ── 데이터 출처 ── */}
          <div className="flex items-center justify-center gap-1.5 pt-2 pb-4">
            <span className="text-[10px] text-zinc-600">
              데이터 출처: {(wine.source ?? wine.data_source) === "naver_shopping" ? "네이버 쇼핑" : (wine.source ?? wine.data_source) ?? "알 수 없음"}
              {wine.vivino_rating ? " · Vivino" : ""}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
