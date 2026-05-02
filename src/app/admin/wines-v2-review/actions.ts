"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";

export interface WineV2Patch {
  country_ko?: string;
  region_ko?: string | null;
  producer?: string | null;
  grape_varieties?: string[];
}

/**
 * 필드 UPDATE — 어드민이 직접 입력한 값은 그대로 신뢰 (변환 모듈 안 거침).
 * 빈 문자열은 null로 변환 (region_ko, producer만).
 */
export async function updateWineV2(id: string, patch: WineV2Patch) {
  const { supabase } = await requireAdmin();

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.country_ko != null) {
    const v = patch.country_ko.trim();
    if (!v) return { error: "country_ko는 비울 수 없습니다 (NOT NULL)" };
    update.country_ko = v;
  }
  if ("region_ko" in patch) {
    update.region_ko = patch.region_ko?.trim() || null;
  }
  if ("producer" in patch) {
    update.producer = patch.producer?.trim() || null;
  }
  if (Array.isArray(patch.grape_varieties)) {
    const arr = patch.grape_varieties
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (arr.length === 0) return { error: "grape_varieties는 비울 수 없습니다" };
    update.grape_varieties = arr;
  }

  const { error } = await supabase.from("wines_v2").update(update).eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "중복된 값이 있어 저장할 수 없습니다" };
    return { error: error.message };
  }
  revalidatePath("/admin/wines-v2-review");
  return { success: true };
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
