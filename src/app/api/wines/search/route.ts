import { createClient } from "@/lib/supabase/server";
import { fetchWinesWithVivinoByIds } from "@/lib/wines-v2-fetch";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  if (!query || query.length < 2) {
    return Response.json({ wines: [], source: "db" });
  }

  const rawLimit = parseInt(searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 50;

  const supabase = await createClient();

  const { data: ranked, error } = await supabase.rpc("search_wines", {
    q: query,
    k: limit,
  });

  if (error || !ranked || ranked.length === 0) {
    return Response.json({ wines: [], source: "db", hasMore: false, error: error?.message });
  }

  const ids = (ranked as Array<{ id: string }>).map((r) => r.id);
  const full = await fetchWinesWithVivinoByIds(supabase, ids);

  const byId = new Map<string, (typeof full)[0]>();
  for (const w of full) byId.set(w.id, w);

  const wines = (ranked as Array<{ id: string; score: number }>)
    .map((r) => {
      const row = byId.get(r.id);
      if (!row) return null;
      return { ...row, score: r.score };
    })
    .filter(Boolean);

  return Response.json({ wines, source: "db", hasMore: ranked.length >= limit });
}
