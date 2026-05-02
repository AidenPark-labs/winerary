"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { crawlByUrl } from "@/lib/vivino-crawler";
import {
  loadTermDict,
  buildUpdatePatch,
  type WinesV2Input,
} from "@/lib/wines-v2-transform";

export interface WineFieldUpdate {
  name_ko?: string;
  name_en?: string;
  producer?: string; // v5: 영문 단일
  country_ko?: string;
  region_ko?: string;
  wine_type?: string;
  grape_varieties?: string[];
}

/**
 * v5: wines_v2 필드 일괄 UPDATE — 변환 모듈 통과해 자동 정규화.
 */
export async function updateWineFields(id: string, patch: WineFieldUpdate) {
  const { supabase } = await requireAdmin();

  // current 조회
  const { data: current } = await supabase
    .from("wines")
    .select(
      "name_ko, name_en, wine_type, wine_style, country_ko, region_ko, producer, grape_varieties, grape_blend, alcohol, brand, price, description, image_url, locked_fields, source_refs, source_snapshot",
    )
    .eq("id", id)
    .maybeSingle();
  if (!current) return { error: "와인을 찾을 수 없습니다" };

  // UI 필드 → WinesV2Input
  const transformPatch: Partial<WinesV2Input> = {};
  if (patch.name_ko !== undefined) transformPatch.name_ko = patch.name_ko;
  if (patch.name_en !== undefined) transformPatch.name_en = patch.name_en;
  if (patch.country_ko !== undefined) transformPatch.country = patch.country_ko;
  if (patch.region_ko !== undefined) transformPatch.region = patch.region_ko;
  if (patch.producer !== undefined) transformPatch.producer = patch.producer;
  if (patch.wine_type !== undefined) transformPatch.wine_type = patch.wine_type;
  if (Array.isArray(patch.grape_varieties)) {
    transformPatch.grape_varieties = patch.grape_varieties;
  }

  const dict = await loadTermDict(supabase);
  const result = await buildUpdatePatch(supabase, current as any, transformPatch, { dict });

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { ...result.wineUpdate, updated_at: now };
  if (result.needs_review_reasons.length === 0 && "needs_review" in update === false) {
    update.needs_review = false;
    update.needs_review_reasons = null;
  }

  const { error } = await supabase.from("wines").update(update).eq("id", id);
  if (error) {
    if (error.code === "23505" && error.message.includes("name_ko")) {
      return { error: "이미 사용 중인 한국어명입니다" };
    }
    return { error: error.message };
  }
  revalidatePath("/admin/vivino-review");
  // grape_unknowns는 needs_review_reasons 중 grape: 카테고리만 추출
  const grapeUnknowns = result.needs_review_reasons
    .filter((r) => r.startsWith("grape:"))
    .map((r) => r.slice(6));
  return { success: true, grape_unknowns: grapeUnknowns };
}

/** Vivino 매칭 확정 — vivino_wines.needs_review=false, reviewed_at=now */
export async function confirmVivinoMatch(id: string) {
  const { supabase } = await requireAdmin();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("vivino_wines")
    .update({ needs_review: false, reviewed_at: now, updated_at: now })
    .eq("wine_id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/vivino-review");
  return { success: true };
}

/**
 * 어드민이 올바른 Vivino URL을 찾았을 때.
 * 새 URL로 크롤링 → vivino_wines UPSERT → needs_review=true (재검수 대기).
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
  const vivinoRow = {
    vivino_url: crawl.vivinoUrl,
    vivino_wine_id: crawl.vivinoWineId != null ? String(crawl.vivinoWineId) : null,
    vivino_name: crawl.vivinoName,
    rating: crawl.rating,
    reviews: crawl.reviews,
    winery: crawl.facts.winery || null,
    grapes: crawl.facts.grapes || null,
    region: crawl.facts.region || null,
    style: crawl.facts.style || null,
    alcohol: crawl.facts.alcohol || null,
    description: crawl.facts.description || null,
    allergens: crawl.facts.allergens || null,
    needs_review: true,
    reviewed_at: null,
    updated_at: now,
  };

  // UPSERT
  const { data: existing } = await supabase
    .from("vivino_wines")
    .select("wine_id")
    .eq("wine_id", id)
    .maybeSingle();
  const { error } = existing
    ? await supabase.from("vivino_wines").update(vivinoRow).eq("wine_id", id)
    : await supabase.from("vivino_wines").insert({ wine_id: id, ...vivinoRow });

  if (error) return { error: error.message };
  revalidatePath("/admin/vivino-review");
  return { success: true };
}

/** Vivino 매칭 해제 — vivino_wines DELETE */
export async function unlinkVivinoMatch(id: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("vivino_wines").delete().eq("wine_id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/vivino-review");
  return { success: true };
}
