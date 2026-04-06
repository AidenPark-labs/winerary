import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import VivinoRating from "./VivinoRating";
import WineActions from "./WineActions";

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

  // 같은 타입/국가의 유사 와인 추천
  const { data: similar } = await supabase
    .from("wines")
    .select("id, name_ko, wine_type, country, price, vivino_rating, naver_image")
    .neq("id", id)
    .eq("wine_type", wine.wine_type)
    .not("price", "is", null)
    .order("vivino_rating", { ascending: false, nullsFirst: false })
    .limit(5);

  return (
    <div className="flex flex-col pb-28">
      {/* 헤더 */}
      <header className="px-5 pt-12 pb-4 flex items-center gap-3">
        <Link href="/find" className="text-zinc-400 hover:text-zinc-200 text-2xl w-8">←</Link>
        <h1 className="text-xl font-bold truncate">{wine.name_ko}</h1>
      </header>

      {/* 와인 이미지 */}
      {wine.naver_image && (
        <div className="mx-4 rounded-2xl overflow-hidden bg-zinc-900" style={{ height: "250px" }}>
          <img src={wine.naver_image} alt={wine.name_ko} className="w-full h-full object-contain" />
        </div>
      )}

      <div className="px-4 pt-4 flex flex-col gap-5">
        {/* 이름 + 태그 */}
        <div>
          <h2 className="text-2xl font-bold text-white">{wine.name_ko}</h2>
          {wine.name_en && (
            <p className="text-sm text-zinc-500 italic mt-0.5">{wine.name_en}</p>
          )}
          {(wine.producer || wine.country) && (
            <p className="text-sm text-zinc-400 mt-1">
              {[wine.producer, wine.country, wine.region].filter(Boolean).join(" · ")}
            </p>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            {wine.wine_type && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-zinc-300">
                {TYPE_KO[wine.wine_type] ?? wine.wine_type}
              </span>
            )}
            {wine.grape_variety && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-zinc-300">
                🍇 {wine.grape_variety}
              </span>
            )}
          </div>
        </div>

        {/* 가격 + Vivino 별점 */}
        <div className="flex items-center gap-3">
          {wine.price && (
            <div className="px-4 py-2.5 rounded-xl bg-emerald-950/30 border border-emerald-800/40">
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

        {/* 설명 */}
        {wine.description && !/예상됩니다|추정됩니다|부족하/.test(wine.description) && (
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2">와인 설명</h3>
            <p className="text-sm text-zinc-300 leading-relaxed">{wine.description}</p>
          </div>
        )}

        {/* 외부 링크 */}
        {wine.naver_link && (
          <a href={wine.naver_link} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 py-3 rounded-xl border border-emerald-800/60 bg-emerald-950/30 text-emerald-300 text-sm hover:bg-emerald-900/40 transition-colors">
            💰 네이버에서 구매하기
          </a>
        )}

        {/* 내 와인에 추가 / 기록하기 */}
        <WineActions wine={wine} />

        {/* 유사 와인 */}
        {similar && similar.length > 0 && (
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">비슷한 와인</h3>
            <div className="flex flex-col gap-2.5">
              {similar.map((w) => (
                <Link
                  key={w.id}
                  href={`/wines/${w.id}`}
                  className="flex items-center gap-3 p-2.5 rounded-xl bg-zinc-800/60 hover:bg-zinc-800 transition-colors"
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
  );
}
