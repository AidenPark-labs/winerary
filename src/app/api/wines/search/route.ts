import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  if (!query || query.length < 2) {
    return Response.json({ wines: [], source: "db" });
  }

  const supabase = await createClient();
  const exact = `%${query}%`;

  // 1차: 정확한 부분문자열 매칭
  const filters = [
    `name_ko.ilike.${exact}`,
    `name_en.ilike.${exact}`,
    `grape_variety.ilike.${exact}`,
    `producer.ilike.${exact}`,
  ];

  // 공백 무시 fuzzy는 한글 검색어이고 3자 이상일 때만 (영문은 오매칭 위험)
  const stripped = query.replace(/\s+/g, "");
  const isKorean = /[가-힣]/.test(query);
  if (isKorean && stripped.length >= 3) {
    const fuzzy = "%" + stripped.split("").join("%") + "%";
    filters.push(`name_ko.ilike.${fuzzy}`);
  }

  const { data } = await supabase
    .from("wines")
    .select("id, name_ko, name_en, wine_type, country, region, grape_variety, producer, description, price, naver_link, naver_image, vivino_url, vivino_rating, vivino_reviews")
    .or(filters.join(","))
    .order("price", { ascending: true, nullsFirst: false })
    .limit(20);

  return Response.json({ wines: data ?? [], source: "db" });
}
