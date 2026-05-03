import type { WineSuggestion } from "@/types";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 2) return Response.json({ wines: [] });

  const supabase = await createClient();

  // 1) RPC 검색 (랭킹·필터)
  const { data: ranked, error } = await supabase.rpc("search_wines", { q, k: 10 });
  if (error || !ranked || ranked.length === 0) return Response.json({ wines: [] });

  const ids = (ranked as Array<{ id: string }>).map((r) => r.id);

  // 2) wines + vivino_wines 합성 (검수 완료된 vivino만)
  const [winesRes, vivinosRes] = await Promise.all([
    supabase
      .from("wines")
      .select("id, name_ko, name_en, wine_type, country_ko, grape_varieties, producer, price")
      .in("id", ids),
    supabase
      .from("vivino_wines")
      .select("wine_id, vivino_url, rating")
      .in("wine_id", ids)
      .not("reviewed_at", "is", null),
  ]);

  type WineRow = {
    id: string;
    name_ko: string;
    name_en: string | null;
    wine_type: string | null;
    country_ko: string | null;
    grape_varieties: string[] | null;
    producer: string | null;
    price: number | null;
  };
  const wineMap = new Map<string, WineRow>();
  for (const w of (winesRes.data ?? []) as WineRow[]) wineMap.set(w.id, w);
  const vivinoMap = new Map<string, { vivino_url: string | null }>();
  for (const v of vivinosRes.data ?? []) vivinoMap.set(v.wine_id, v);

  const wines: WineSuggestion[] = (ranked as Array<{ id: string }>)
    .map((r): WineSuggestion | null => {
      const w = wineMap.get(r.id);
      if (!w) return null;
      const v = vivinoMap.get(r.id);
      return {
        wine_id: w.id,
        name: w.name_en ?? w.name_ko ?? "",
        name_ko: w.name_ko ?? "",
        producer: w.producer ?? "",
        country: w.country_ko ?? "",
        type: w.wine_type ?? "",
        grapes:
          Array.isArray(w.grape_varieties) && w.grape_varieties.length > 0
            ? w.grape_varieties.join(", ")
            : "",
        vintage_range: "",
        vivino_url: v?.vivino_url ?? null,
      };
    })
    .filter((x): x is WineSuggestion => x !== null);

  return Response.json({ wines });
}
