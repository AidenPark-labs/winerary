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

  return (
    <div className="flex flex-col pb-28">
      {/* 헤더 */}
      <header className="px-5 pt-12 pb-4 flex items-center gap-3">
        <BackButton />
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
          {(d.producer || d.country) && (
            <p className="text-sm text-zinc-400 mt-1">
              {[d.producer, d.country, d.region].filter(Boolean).join(" · ")}
            </p>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            {d.wine_type && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-zinc-300">
                {TYPE_KO[d.wine_type] ?? d.wine_type}
              </span>
            )}
            {d.grapes && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-zinc-300">
                🍇 {d.grapes}
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

        {/* 상세 정보 */}
        {(d.style || d.alcohol || d.region || d.producer) && (
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden">
            <div className="px-5 pt-4 pb-2">
              <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">Wine Details</h3>
            </div>
            <div className="px-5 pb-4 flex flex-col gap-2">
              {d.producer && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">와이너리</span>
                  <span className="text-sm text-zinc-200">{d.producer}</span>
                </div>
              )}
              {d.region && (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-xs text-zinc-500 flex-shrink-0 pt-0.5">지역</span>
                  <span className="text-sm text-zinc-200 text-right">{d.region}</span>
                </div>
              )}
              {d.style && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">스타일</span>
                  <span className="text-sm text-zinc-200">{d.style}</span>
                </div>
              )}
              {d.alcohol && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">도수</span>
                  <span className="text-sm text-zinc-200">{d.alcohol}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 설명 */}
        {d.description && !/예상됩니다|추정됩니다|부족하/.test(d.description) && (
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2">와인 설명</h3>
            <p className="text-sm text-zinc-300 leading-relaxed">{d.description}</p>
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
