import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("wine_wishlist")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (!data || data.length === 0) return Response.json({ items: [] });

  // wine_id가 있는 항목들의 와인 상세정보 조회
  const wineIds = data.filter((d) => d.wine_id).map((d) => d.wine_id);
  let winesMap: Record<string, any> = {};

  if (wineIds.length > 0) {
    const { data: wines } = await supabase
      .from("wines")
      .select("id, name_ko, name_en, wine_type, country, grape_variety, naver_image, vivino_rating, vivino_reviews, price, final_grapes, vivino_grapes, final_country, vivino_country, final_type, vivino_type")
      .in("id", wineIds);
    if (wines) {
      wines.forEach((w) => { winesMap[w.id] = w; });
    }
  }

  const items = data.map((item) => ({
    ...item,
    wine: item.wine_id ? winesMap[item.wine_id] ?? null : null,
  }));

  return Response.json({ items });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { name_ko, name_en, wine_id } = await request.json();
  if (!name_ko || !name_en) return Response.json({ error: "이름이 필요합니다" }, { status: 400 });

  // 중복 체크
  const { data: existing } = await supabase
    .from("wine_wishlist")
    .select("id")
    .eq("user_id", user.id)
    .eq("name_en", name_en)
    .single();

  if (existing) {
    return Response.json({ already: true, id: existing.id });
  }

  const insertData: Record<string, string> = { user_id: user.id, name_ko, name_en };
  if (wine_id) insertData.wine_id = wine_id;

  const { data, error } = await supabase
    .from("wine_wishlist")
    .insert(insertData)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ item: data });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await request.json();
  if (!id) return Response.json({ error: "ID가 필요합니다" }, { status: 400 });

  await supabase
    .from("wine_wishlist")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  return Response.json({ success: true });
}
