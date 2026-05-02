import { createClient } from "@/lib/supabase/server";
import { logWineEvent } from "@/lib/wine-events";

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

  // v5: wines_v2 + vivino_wines 합성
  const wineFields = "id, name_ko, name_en, wine_type, country_ko, grape_varieties, image_url, price";

  // wine_id가 있는 항목들의 와인 상세정보 조회
  const withId = data.filter((d) => d.wine_id);
  const withoutId = data.filter((d) => !d.wine_id);
  const winesMap: Record<string, any> = {};

  // vivino 정보 (rating·reviews) 한 번에
  const allWineIds: string[] = [];

  if (withId.length > 0) {
    const ids = withId.map((d) => d.wine_id);
    const { data: wines } = await supabase
      .from("wines")
      .select(wineFields)
      .in("id", ids);
    if (wines) {
      wines.forEach((w) => { winesMap[w.id] = w; });
      allWineIds.push(...wines.map((w) => w.id));
    }
  }

  // wine_id 없는 항목: name_en으로 wines_v2 매칭 시도 → wine_id 백필
  if (withoutId.length > 0) {
    const names = withoutId.map((d) => d.name_en);
    const { data: matched } = await supabase
      .from("wines")
      .select(wineFields)
      .in("name_en", names);

    if (matched && matched.length > 0) {
      const nameMap: Record<string, any> = {};
      matched.forEach((w) => { if (w.name_en) nameMap[w.name_en] = w; });

      // 백필: wine_id 업데이트 (비동기, 응답 차단 안 함)
      const updates = withoutId
        .filter((d) => nameMap[d.name_en])
        .map((d) =>
          supabase.from("wine_wishlist").update({ wine_id: nameMap[d.name_en].id }).eq("id", d.id),
        );
      Promise.all(updates).catch(() => {});

      withoutId.forEach((d) => {
        const w = nameMap[d.name_en];
        if (w) {
          winesMap[w.id] = w;
          d.wine_id = w.id;
          allWineIds.push(w.id);
        }
      });
    }
  }

  // vivino_wines 한 번에 조회 (검수 완료된 것만)
  if (allWineIds.length > 0) {
    const { data: vivinos } = await supabase
      .from("vivino_wines")
      .select("wine_id, rating, reviews, reviewed_at")
      .in("wine_id", allWineIds)
      .not("reviewed_at", "is", null);
    for (const v of vivinos ?? []) {
      const w = winesMap[v.wine_id];
      if (w) {
        w.vivino_rating = v.rating;
        w.vivino_reviews = v.reviews;
      }
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

  const { name_ko, name_en, wine_id, source } = await request.json();
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
  if (source === "ai") insertData.source = "ai";

  const { data, error } = await supabase
    .from("wine_wishlist")
    .insert(insertData)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // 인기도 집계 (wishlist 이벤트, 가중치 3)
  if (wine_id) {
    logWineEvent({ wineId: wine_id, eventType: "wishlist", userId: user.id }).catch(() => {});
  }

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
