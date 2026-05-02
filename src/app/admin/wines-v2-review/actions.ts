"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import {
  loadTermDict,
  buildUpdatePatch,
  type WinesV2Input,
} from "@/lib/wines-v2-transform";

export interface WineV2Patch {
  country_ko?: string;
  region_ko?: string | null;
  producer?: string | null;
  grape_varieties?: string[];
}

export interface NormalizedFields {
  country_ko?: string;
  region_ko?: string | null;
  producer?: string | null;
  grape_varieties?: string[];
  grape_blend?: { grape: string; percent: number }[] | null;
}

/**
 * 필드 UPDATE — 변환 모듈을 통과시켜 자동 정규화.
 *
 * 동작:
 *   - 어드민 입력 → buildUpdatePatch (path 분해, 괄호 제거, 한·영 변환, grape 비율 분리)
 *   - 변환 결과 needs_review_reasons 비었으면 needs_review=false (검수 통과)
 *   - 사유 남으면 needs_review=true 유지 (재검수 필요)
 */
export async function updateWineV2(id: string, patch: WineV2Patch) {
  const { supabase } = await requireAdmin();

  // 1) 현재 wines_v2 행 조회
  const { data: current, error: cErr } = await supabase
    .from("wines_v2")
    .select(
      "name_ko, name_en, wine_type, wine_style, country_ko, region_ko, producer, grape_varieties, grape_blend, alcohol, brand, price, description, image_url, locked_fields, source_refs, source_snapshot",
    )
    .eq("id", id)
    .single();
  if (cErr || !current) return { error: "와인을 찾을 수 없습니다" };

  // 2) 변환 모듈 patch 형태로 매핑 (UI 필드 → 모듈 필드)
  const transformPatch: Partial<WinesV2Input> = {};
  if (patch.country_ko !== undefined) {
    const v = patch.country_ko.trim();
    if (!v) return { error: "country_ko는 비울 수 없습니다 (NOT NULL)" };
    transformPatch.country = v; // 모듈은 country (한·영 모두 허용 → country_ko로 변환)
  }
  if ("region_ko" in patch) {
    transformPatch.region = patch.region_ko?.trim() || null;
  }
  if ("producer" in patch) {
    transformPatch.producer = patch.producer?.trim() || null;
  }
  if (Array.isArray(patch.grape_varieties)) {
    const arr = patch.grape_varieties.map((s) => s.trim()).filter((s) => s.length > 0);
    if (arr.length === 0) return { error: "grape_varieties는 비울 수 없습니다" };
    transformPatch.grape_varieties = arr;
  }

  // 3) 변환 모듈 호출
  const dict = await loadTermDict(supabase);
  const result = await buildUpdatePatch(supabase, current as any, transformPatch, { dict });

  // 4) UPDATE
  const update: Record<string, unknown> = {
    ...result.wineUpdate,
    updated_at: new Date().toISOString(),
  };
  // needs_review 재계산: 변환 모듈이 모호함 발견 시 유지, 아니면 false
  if (result.needs_review_reasons.length === 0) {
    update.needs_review = false;
    update.needs_review_reasons = null;
  } else {
    update.needs_review = true;
    update.needs_review_reasons = result.needs_review_reasons;
  }

  const { error } = await supabase.from("wines_v2").update(update).eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "중복된 값이 있어 저장할 수 없습니다" };
    return { error: error.message };
  }
  revalidatePath("/admin/wines-v2-review");

  // 5) 정규화된 값을 클라이언트에 반환 (UI에 즉시 반영)
  const normalized: NormalizedFields = {
    country_ko: result.wineUpdate.country_ko ?? undefined,
    region_ko:
      "region_ko" in result.wineUpdate ? result.wineUpdate.region_ko ?? null : undefined,
    producer:
      "producer" in result.wineUpdate ? result.wineUpdate.producer ?? null : undefined,
    grape_varieties: result.wineUpdate.grape_varieties ?? undefined,
    grape_blend:
      "grape_blend" in result.wineUpdate ? result.wineUpdate.grape_blend ?? null : undefined,
  };
  return {
    success: true as const,
    normalized,
    new_reasons: result.needs_review_reasons,
  };
}

/**
 * 검수 승인 — needs_review=false, needs_review_reasons=null.
 * 사유 무시하고 통과시킬 때.
 */
export async function approveWineV2(id: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("wines_v2")
    .update({
      needs_review: false,
      needs_review_reasons: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/wines-v2-review");
  return { success: true };
}
