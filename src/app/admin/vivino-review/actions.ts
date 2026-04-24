"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { crawlByUrl } from "@/lib/vivino-crawler";
import { loadGrapeDict, normalizeGrapes } from "@/lib/grape-normalize";

export interface WineFieldUpdate {
  name_ko?: string;
  name_en?: string;
  producer_ko?: string;
  producer_en?: string;
  country?: string;
  country_ko?: string;
  region?: string;
  region_ko?: string;
  wine_type?: string;
  grape_varieties?: string[]; // 배열 전체 교체
}

/**
 * wines 필드 일괄 UPDATE. 빈 문자열은 null로 변환, undefined는 무시.
 * 빈티지 제거 검수에서 어드민이 직접 교정할 때 사용.
 */
export async function updateWineFields(id: string, patch: WineFieldUpdate) {
  const { supabase } = await requireAdmin();
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let grapeUnknowns: string[] = [];

  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (k === "grape_varieties" && Array.isArray(v)) {
      // term_dict 기반 정규화 → grape_varieties + grape_varieties_ko 자동 생성
      const dict = await loadGrapeDict(supabase);
      const result = normalizeGrapes(v as string[], dict);
      payload.grape_varieties = result.normalized_en;
      payload.grape_varieties_ko = result.normalized_ko;
      grapeUnknowns = result.unknowns;
    } else if (Array.isArray(v)) {
      payload[k] = v.filter((s) => typeof s === "string" && s.trim().length > 0).map((s) => s.trim());
    } else if (typeof v === "string") {
      payload[k] = v.trim() === "" ? null : v.trim();
    } else {
      payload[k] = v;
    }
  }
  const { error } = await supabase.from("wines").update(payload).eq("id", id);
  if (error) {
    if (error.code === "23505" && error.message.includes("wines_name_ko_unique")) {
      return { error: "이미 사용 중인 한국어명입니다" };
    }
    return { error: error.message };
  }
  revalidatePath("/admin/vivino-review");
  return { success: true, grape_unknowns: grapeUnknowns };
}

export async function confirmVivinoMatch(id: string) {
  const { supabase } = await requireAdmin();

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("wines")
    .update({
      vivino_needs_review: false,
      vivino_reviewed_at: now,
      updated_at: now,
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/admin/vivino-review");
  return { success: true };
}

/**
 * 검수 중에 어드민이 올바른 Vivino URL을 찾았을 때 호출.
 * 새 URL로 크롤링 → wines.vivino_* 덮어쓰기 → needs_review=true 유지, reviewed_at=null (재검수 대기).
 * 어드민은 갱신된 카드 보고 K(유지) / U(해제)로 최종 확정.
 */
export async function replaceVivinoUrl(id: string, newUrl: string) {
  const trimmed = newUrl.trim();
  if (!trimmed) return { error: "URL이 비어있습니다" };
  if (!trimmed.includes("vivino.com")) return { error: "Vivino URL이 아닙니다" };

  const { supabase } = await requireAdmin();

  const crawl = await crawlByUrl(trimmed);
  if (!crawl.success) {
    return { error: `크롤링 실패 (${crawl.step}): ${crawl.error}` };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("wines")
    .update({
      vivino_url: crawl.vivinoUrl,
      vivino_page_url: crawl.vivinoUrl,
      vivino_wine_id: crawl.vivinoWineId,
      vivino_name: crawl.vivinoName,
      vivino_rating: crawl.rating,
      vivino_reviews: crawl.reviews,
      vivino_winery: crawl.facts.winery || null,
      vivino_grapes: crawl.facts.grapes || null,
      vivino_region: crawl.facts.region || null,
      vivino_style: crawl.facts.style || null,
      vivino_alcohol: crawl.facts.alcohol || null,
      vivino_description: crawl.facts.description || null,
      vivino_allergens: crawl.facts.allergens || null,
      vivino_needs_review: true,
      vivino_reviewed_at: null,
      updated_at: now,
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/admin/vivino-review");
  return { success: true };
}

export async function unlinkVivinoMatch(id: string) {
  const { supabase } = await requireAdmin();

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("wines")
    .update({
      vivino_url: null,
      vivino_page_url: null,
      vivino_wine_id: null,
      vivino_rating: null,
      vivino_reviews: null,
      vivino_winery: null,
      vivino_grapes: null,
      vivino_region: null,
      vivino_style: null,
      vivino_alcohol: null,
      vivino_allergens: null,
      vivino_description: null,
      vivino_needs_review: false,
      vivino_reviewed_at: now,
      updated_at: now,
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/admin/vivino-review");
  return { success: true };
}
