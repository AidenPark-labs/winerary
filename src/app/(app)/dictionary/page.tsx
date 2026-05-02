import { createClient } from "@/lib/supabase/server";
import DictionaryClient from "./DictionaryClient";

export const revalidate = 300; // 인기 와인 섹션 5분 캐시

interface SP {
  q?: string;
  type?: string;
  country?: string;
  grape?: string;
  k?: string;
}

export interface FilterOption { value: string; count: number }
export interface DictionaryOptions {
  grapes: FilterOption[];
  countries: FilterOption[];
}
export interface DictionaryWine {
  id: string;
  name_ko: string;
  name_en: string | null;
  country_display: string | null;
  region_display: string | null;
  grape_varieties_display: string[] | null;
  style_display: string | null;
  wine_type: string | null;
  image_url: string | null;
  vivino_rating: number | null;
  vivino_reviews: number | null;
  price: number | null;
  score: number;
}

export interface PopularWine {
  id: string;
  name_ko: string;
  name_en: string | null;
  country_ko: string | null;
  wine_type: string | null;
  image_url: string | null;
  vivino_rating: number | null;
  popularity_score: number;
}

export default async function DictionaryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = sp.q?.trim() || null;
  const type = sp.type || null;
  const country = sp.country || null;
  const grape = sp.grape || null;
  const k = Math.min(200, Math.max(20, parseInt(sp.k ?? "50", 10) || 50));

  const supabase = await createClient();

  const [{ data: options }, { data: results }, { data: topRanked }] = await Promise.all([
    supabase.rpc("dictionary_filter_options", { filter_wine_type: type }),
    supabase.rpc("search_wines", {
      q,
      filter_wine_type: type,
      filter_country_ko: country,
      filter_grapes_ko: grape ? [grape] : null,
      filter_price_min: null,
      filter_price_max: null,
      q_embedding: null,
      k,
    }),
    supabase.rpc("top_wines_by_events", { window_days: 30, k: 10 }),
  ]);

  // 인기 와인 상세 조회 (순위 유지) — wines_v2 + vivino_wines 합성
  let popular: PopularWine[] = [];
  if (topRanked && topRanked.length > 0) {
    const ids = (topRanked as Array<{ wine_id: string; score: number }>).map((r) => r.wine_id);
    const [winesRes, vivinosRes] = await Promise.all([
      supabase
        .from("wines")
        .select("id, name_ko, name_en, country_ko, wine_type, image_url")
        .in("id", ids),
      supabase
        .from("vivino_wines")
        .select("wine_id, rating, reviewed_at")
        .in("wine_id", ids),
    ]);
    const byId = new Map<string, any>();
    for (const w of winesRes.data ?? []) byId.set(w.id, w);
    const ratingMap = new Map<string, number>();
    for (const v of vivinosRes.data ?? []) {
      // 검수 완료된 것만 노출
      if (v.reviewed_at && v.rating != null) ratingMap.set(v.wine_id, v.rating);
    }
    popular = (topRanked as Array<{ wine_id: string; score: number }>)
      .map((r) => {
        const row = byId.get(r.wine_id);
        if (!row) return null;
        return {
          id: row.id,
          name_ko: row.name_ko,
          name_en: row.name_en,
          country_ko: row.country_ko,
          wine_type: row.wine_type,
          image_url: row.image_url,
          vivino_rating: ratingMap.get(r.wine_id) ?? null,
          popularity_score: r.score,
        } as PopularWine;
      })
      .filter((w): w is PopularWine => w !== null);
  }

  return (
    <DictionaryClient
      initial={{
        q: q ?? "",
        type: type ?? "all",
        country: country ?? "",
        grape: grape ?? "",
        k,
      }}
      options={(options as DictionaryOptions) ?? { grapes: [], countries: [] }}
      results={(results as DictionaryWine[]) ?? []}
      popular={popular}
    />
  );
}
