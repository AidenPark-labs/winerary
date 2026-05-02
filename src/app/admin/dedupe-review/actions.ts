"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import {
  loadTermDict,
  buildUpdatePatch,
  type WinesV2Input,
} from "@/lib/wines-v2-transform";

export interface FinalMergeData {
  name_ko?: string | null;
  name_en?: string | null;
  country_ko?: string | null;   // v5: 한글 단일
  region_ko?: string | null;
  wine_type?: string | null;
  producer?: string | null;     // v5: 영문 단일
  grape_varieties?: string[] | null;
  alcohol?: string | null;
  image_url?: string | null;
}

/**
 * v5: raw_wine을 target wines_v2로 merge.
 * 변환 모듈을 통과시켜 자동 정규화. Vivino 필드는 vivino-review 전용.
 */
export async function confirmDedupe(
  candidateId: string,
  finalData: FinalMergeData,
  note?: string,
) {
  const { supabase, user } = await requireAdmin();
  const now = new Date().toISOString();

  // 1) 후보 조회
  const { data: candidate, error: cErr } = await supabase
    .from("wine_dedupe_candidates")
    .select("id, raw_wine_id, target_wine_id, status")
    .eq("id", candidateId)
    .single();
  if (cErr || !candidate) return { error: "후보를 찾을 수 없습니다" };
  if (candidate.status !== "pending") return { error: `이미 ${candidate.status} 상태입니다` };

  // 2) target 현재 행 조회 (변환 모듈 buildUpdatePatch 입력용)
  const { data: target, error: tErr } = await supabase
    .from("wines")
    .select(
      "name_ko, name_en, wine_type, wine_style, country_ko, region_ko, producer, grape_varieties, grape_blend, alcohol, brand, price, description, image_url, locked_fields, source_refs, source_snapshot",
    )
    .eq("id", candidate.target_wine_id)
    .single();
  if (tErr || !target) return { error: "target wine을 찾을 수 없습니다" };

  // 3) finalData → WinesV2Input
  const transformPatch: Partial<WinesV2Input> = {};
  if ("name_ko" in finalData) transformPatch.name_ko = finalData.name_ko ?? "";
  if ("name_en" in finalData) transformPatch.name_en = finalData.name_en ?? "";
  if ("country_ko" in finalData && finalData.country_ko != null) {
    transformPatch.country = finalData.country_ko;
  }
  if ("region_ko" in finalData) transformPatch.region = finalData.region_ko;
  if ("wine_type" in finalData) transformPatch.wine_type = finalData.wine_type;
  if ("producer" in finalData) transformPatch.producer = finalData.producer;
  if ("alcohol" in finalData) transformPatch.alcohol = finalData.alcohol;
  if ("image_url" in finalData) transformPatch.image_url = finalData.image_url;
  if ("grape_varieties" in finalData) {
    transformPatch.grape_varieties = finalData.grape_varieties ?? [];
  }
  // source_refs 누적
  const existingRefs = Array.isArray(target.source_refs) ? (target.source_refs as string[]) : [];
  if (!existingRefs.includes(candidate.raw_wine_id)) {
    transformPatch.source_refs = [...existingRefs, candidate.raw_wine_id];
  }

  const dict = await loadTermDict(supabase);
  const result = await buildUpdatePatch(supabase, target as any, transformPatch, { dict });

  // 4) wines_v2 UPDATE
  const update = { ...result.wineUpdate, updated_at: now };
  const { error: uErr } = await supabase
    .from("wines")
    .update(update)
    .eq("id", candidate.target_wine_id);
  if (uErr) {
    if (uErr.code === "23505" && uErr.message.includes("name_ko")) {
      return { error: "이미 사용 중인 한국어명입니다" };
    }
    return { error: `wines 병합 실패: ${uErr.message}` };
  }

  // 5) raw_wines.promoted_wine_id 연결
  const { error: rawErr } = await supabase
    .from("raw_wines")
    .update({ promoted_wine_id: candidate.target_wine_id, promoted_at: now })
    .eq("id", candidate.raw_wine_id);
  if (rawErr) return { error: `raw_wines 연결 실패: ${rawErr.message}` };

  // 6) 후보 상태 업데이트
  const { error: statErr } = await supabase
    .from("wine_dedupe_candidates")
    .update({
      status: "confirmed",
      reviewed_at: now,
      reviewed_by: user.id,
      reviewed_note: note?.trim() || null,
    })
    .eq("id", candidateId);
  if (statErr) return { error: `상태 업데이트 실패: ${statErr.message}` };

  revalidatePath("/admin/dedupe-review");
  const grapeUnknowns = result.needs_review_reasons
    .filter((r) => r.startsWith("grape:"))
    .map((r) => r.slice(6));
  return {
    success: true,
    wine_id: candidate.target_wine_id,
    normalized_grapes: result.wineUpdate.grape_varieties,
    grape_unknowns: grapeUnknowns,
  };
}

/** 다른 와인이라고 판단 — 반려. raw_wine은 별도 promote 대상으로 남음. */
export async function rejectDedupe(candidateId: string, note?: string) {
  const { supabase, user } = await requireAdmin();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("wine_dedupe_candidates")
    .update({
      status: "rejected",
      reviewed_at: now,
      reviewed_by: user.id,
      reviewed_note: note?.trim() || null,
    })
    .eq("id", candidateId)
    .eq("status", "pending");
  if (error) return { error: error.message };

  revalidatePath("/admin/dedupe-review");
  return { success: true };
}
