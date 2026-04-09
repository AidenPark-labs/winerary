import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wineId = searchParams.get("wine_id");
  if (!wineId) return Response.json({ exists: false });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ exists: false });

  const { data } = await supabase
    .from("wine_wishlist")
    .select("id")
    .eq("user_id", user.id)
    .eq("wine_id", wineId)
    .limit(1)
    .maybeSingle();

  return Response.json({ exists: !!data });
}
