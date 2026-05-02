/**
 * wines_v2 + vivino_wines 조회 헬퍼 (v5).
 *
 * 두 테이블 사이 FK 없으므로 supabase-js nested select 안 됨.
 * 헬퍼로 두 쿼리 합성해 Wine 객체 (vivino 옵셔널 포함) 반환.
 *
 * Phase 5 swap 후 wines_v2 → wines 변경 (sed). vivino_wines는 그대로.
 *
 * 사용:
 *   const wine = await fetchWineWithVivinoById(sb, id);
 *   const wines = await fetchWinesWithVivinoByIds(sb, ids);
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Wine, VivinoWine } from "@/types";

/** vivino_wines 노출 조건 — reviewed_at IS NOT NULL일 때만 표시 (정책) */
function isVivinoVisible(v: VivinoWine | null | undefined): v is VivinoWine {
  return !!v && v.reviewed_at != null;
}

export async function fetchWineWithVivinoById(
  sb: SupabaseClient,
  id: string,
): Promise<Wine | null> {
  const [wineRes, vivinoRes] = await Promise.all([
    sb.from("wines_v2").select("*").eq("id", id).maybeSingle(),
    sb.from("vivino_wines").select("*").eq("wine_id", id).maybeSingle(),
  ]);
  if (wineRes.error || !wineRes.data) return null;

  const wine = wineRes.data as Wine;
  const vivino = vivinoRes.data as VivinoWine | null;
  return {
    ...wine,
    vivino: isVivinoVisible(vivino) ? vivino : null,
  };
}

export async function fetchWinesWithVivinoByIds(
  sb: SupabaseClient,
  ids: string[],
): Promise<Wine[]> {
  if (ids.length === 0) return [];
  const [winesRes, vivinosRes] = await Promise.all([
    sb.from("wines_v2").select("*").in("id", ids),
    sb.from("vivino_wines").select("*").in("wine_id", ids),
  ]);
  if (winesRes.error || !winesRes.data) return [];

  const vivinoMap = new Map<string, VivinoWine>();
  for (const v of (vivinosRes.data ?? []) as VivinoWine[]) {
    if (isVivinoVisible(v)) vivinoMap.set(v.wine_id, v);
  }

  return (winesRes.data as Wine[]).map((w) => ({
    ...w,
    vivino: vivinoMap.get(w.id) ?? null,
  }));
}

/**
 * 어드민 검수에서는 reviewed_at NULL이어도 vivino 정보 필요 (검수 대상).
 * isVivinoVisible 가드 우회.
 */
export async function fetchWineWithVivinoForAdmin(
  sb: SupabaseClient,
  id: string,
): Promise<Wine | null> {
  const [wineRes, vivinoRes] = await Promise.all([
    sb.from("wines_v2").select("*").eq("id", id).maybeSingle(),
    sb.from("vivino_wines").select("*").eq("wine_id", id).maybeSingle(),
  ]);
  if (wineRes.error || !wineRes.data) return null;
  return {
    ...(wineRes.data as Wine),
    vivino: (vivinoRes.data as VivinoWine | null) ?? null,
  };
}
