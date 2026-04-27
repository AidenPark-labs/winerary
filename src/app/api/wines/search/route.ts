import { createClient } from "@/lib/supabase/server";

const SELECT = "id, name_ko, name_en, wine_type, country, country_ko, region, region_path, region_ko, grape_variety, grape_varieties, grape_varieties_ko, producer, producer_ko, producer_en, description, price, naver_link, naver_image, image_url, vivino_url, vivino_rating, vivino_reviews, source";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  if (!query || query.length < 2) {
    return Response.json({ wines: [], source: "db" });
  }

  const rawLimit = parseInt(searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 50;

  const supabase = await createClient();

  const { data: ranked, error } = await supabase.rpc("search_wines", {
    q: query,
    k: limit,
  });

  if (error || !ranked || ranked.length === 0) {
    return Response.json({ wines: [], source: "db", hasMore: false, error: error?.message });
  }

  const ids = (ranked as Array<{ id: string }>).map((r) => r.id);
  const { data: full } = await supabase
    .from("wines")
    .select(SELECT)
    .in("id", ids);

  const byId = new Map<string, Record<string, unknown>>();
  for (const w of full ?? []) byId.set((w as { id: string }).id, w as Record<string, unknown>);

  const wines = (ranked as Array<Record<string, unknown>>)
    .map((r) => {
      const row = byId.get(r.id as string);
      if (!row) return null;
      return {
        ...row,
        score: r.score,
      };
    })
    .filter(Boolean);

  return Response.json({ wines, source: "db", hasMore: ranked.length >= limit });
}
