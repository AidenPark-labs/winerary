import { createClient } from "@/lib/supabase/server";

/**
 * v5: `search_wines` RPC 래퍼.
 * RPC는 기존 wines (구) 기반 랭킹을 반환 — id 동일 정책으로 wines_v2에서도 같은 ID로 조회.
 * Phase 5 swap 후 wines_v2가 wines가 되면 자연 일관 동작.
 *
 * RPC로 랭킹 얻은 뒤, id IN 으로 요청한 SELECT 필드를 wines_v2에서 가져옴.
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
  const { data: full } = await supabase.from("wines_v2").select(select).in("id", ids);
  if (!full) return [];

  const byId = new Map<string, T>();
  for (const w of full) byId.set((w as unknown as T).id, w as unknown as T);

  return (ranked as Array<{ id: string }>)
    .map((r) => byId.get(r.id))
    .filter((w): w is T => !!w);
}
