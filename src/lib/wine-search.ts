import { createClient } from "@/lib/supabase/server";

/**
 * v3: `search_wines` RPC 래퍼.
 * RPC로 랭킹 얻은 뒤, id IN 으로 요청한 SELECT 필드를 보강해 원본 형태로 반환.
 * 기존 호출자 호환을 위해 시그니처는 유지.
 */
export async function searchWines<T extends { id: string }>(
  select: string,
  query: string,
  limit: number,
): Promise<T[]> {
  if (!query || query.trim().length < 2) return [];
  const supabase = await createClient();

  const { data: ranked, error } = await supabase.rpc("search_wines", {
    q: query.trim(),
    k: limit,
  });
  if (error || !ranked || ranked.length === 0) return [];

  const ids = (ranked as Array<{ id: string }>).map((r) => r.id);
  const { data: full } = await supabase.from("wines").select(select).in("id", ids);
  if (!full) return [];

  const byId = new Map<string, T>();
  for (const w of full) byId.set((w as unknown as T).id, w as unknown as T);

  return (ranked as Array<{ id: string }>)
    .map((r) => byId.get(r.id))
    .filter((w): w is T => !!w);
}
