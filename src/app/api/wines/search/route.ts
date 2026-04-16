import { createClient } from "@/lib/supabase/server";
import { buildSearchFilter, scoreAndFilter } from "@/lib/wine-search";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  if (!query || query.length < 2) {
    return Response.json({ wines: [], source: "db" });
  }

  const supabase = await createClient();

  const { data } = await supabase
    .from("wines")
    .select("id, name_ko, name_en, wine_type, country, region, grape_variety, producer, producer_ko, producer_en, description, price, naver_link, naver_image, vivino_url, vivino_page_url, vivino_rating, vivino_reviews")
    .or(buildSearchFilter(query))
    .limit(200);

  const wines = scoreAndFilter(query, data ?? [], 20);

  return Response.json({ wines, source: "db" });
}
