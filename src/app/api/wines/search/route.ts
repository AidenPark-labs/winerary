import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  if (!query || query.length < 2) {
    return Response.json({ wines: [] });
  }

  const supabase = await createClient();

  // 한국어 이름, 영어 이름, 품종, 생산자에서 검색
  const { data } = await supabase
    .from("wines")
    .select("id, name_ko, name_en, wine_type, country, region, grape_variety, producer, price, naver_link, naver_image")
    .or(`name_ko.ilike.%${query}%,name_en.ilike.%${query}%,grape_variety.ilike.%${query}%,producer.ilike.%${query}%`)
    .order("price", { ascending: true, nullsFirst: false })
    .limit(20);

  return Response.json({ wines: data ?? [] });
}
