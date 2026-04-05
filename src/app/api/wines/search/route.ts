import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  if (!query || query.length < 2) {
    return Response.json({ wines: [] });
  }

  const supabase = await createClient();

  // 공백 무시 검색: "무초마스" → "%무%초%마%스%"
  const fuzzy = "%" + query.replace(/\s+/g, "").split("").join("%") + "%";
  // 원본 검색: "무초 마스" → "%무초 마스%"
  const exact = `%${query}%`;

  const { data } = await supabase
    .from("wines")
    .select("id, name_ko, name_en, wine_type, country, region, grape_variety, producer, description, price, naver_link, naver_image, vivino_url")
    .or([
      `name_ko.ilike.${exact}`,
      `name_en.ilike.${exact}`,
      `grape_variety.ilike.${exact}`,
      `producer.ilike.${exact}`,
      `name_ko.ilike.${fuzzy}`,
      `name_en.ilike.${fuzzy}`,
    ].join(","))
    .order("price", { ascending: true, nullsFirst: false })
    .limit(20);

  return Response.json({ wines: data ?? [] });
}
