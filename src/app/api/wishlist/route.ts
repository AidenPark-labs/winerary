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

  return Response.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { name_ko, name_en } = await request.json();
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

  const { data, error } = await supabase
    .from("wine_wishlist")
    .insert({ user_id: user.id, name_ko, name_en })
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
