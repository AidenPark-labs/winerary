import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ profiles: [] }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  if (!query || query.length < 1) {
    return Response.json({ profiles: [] });
  }

  const { data } = await supabase
    .from("profiles")
    .select("id, nickname, avatar_url, user_code")
    .or(`nickname.ilike.%${query}%,user_code.ilike.%${query}%`)
    .neq("id", user.id)
    .limit(5);

  return Response.json({ profiles: data ?? [] });
}
