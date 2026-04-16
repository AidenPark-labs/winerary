import { searchWines } from "@/lib/wine-search";

const SELECT = "id, name_ko, name_en, wine_type, country, region, grape_variety, producer, producer_ko, producer_en, description, price, naver_link, naver_image, vivino_url, vivino_page_url, vivino_rating, vivino_reviews";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  if (!query || query.length < 2) {
    return Response.json({ wines: [], source: "db" });
  }

  const wines = await searchWines(SELECT, query, 20);

  return Response.json({ wines, source: "db" });
}
