import { createClient } from "@/lib/supabase/server";
import DictionaryClient from "./DictionaryClient";

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

export default async function DictionaryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = sp.q?.trim() || null;
  const type = sp.type || null;
  const country = sp.country || null;
  const grape = sp.grape || null;
  const k = Math.min(200, Math.max(20, parseInt(sp.k ?? "50", 10) || 50));

  const supabase = await createClient();

  const [{ data: options }, { data: results }] = await Promise.all([
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
  ]);

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
    />
  );
}
