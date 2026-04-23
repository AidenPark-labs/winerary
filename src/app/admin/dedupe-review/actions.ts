"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";

export interface FinalMergeData {
  name_ko?: string | null;
  name_en?: string | null;
  country?: string | null;
  country_ko?: string | null;
  region?: string | null;
  region_ko?: string | null;
  wine_type?: string | null;
  producer_ko?: string | null;
  producer_en?: string | null;
  grape_varieties?: string[] | null;
  alcohol?: string | null;
  image_url?: string | null;
}

/**
 * 같은 와인 확정 — raw_wine을 target wine으로 merge.
 *
 * 어드민이 UI에서 raw/target/직접편집으로 조합한 "최종 반영 값"을 통째로 받아
 * target wines를 UPDATE한다. 빈 문자열은 null로 저장.
 *
 * 공통 동작:
 *   - raw_wines.promoted_wine_id = target_wine_id (+ promoted_at)
 *   - source_refs[]에 raw_wine.id 추가
 *   - candidate.status = 'confirmed'
 *
 * Vivino 필드는 이 경로에서 안 건드림 (vivino-review 전용).
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

  // 2) target 조회 (source_refs만 필요)
  const { data: target, error: tErr } = await supabase
    .from("wines")
    .select("source_refs")
    .eq("id", candidate.target_wine_id)
    .single();
  if (tErr || !target) return { error: "target wine을 찾을 수 없습니다" };

  // 3) 업데이트 payload 구성: finalData의 모든 필드 적용 (빈 문자열 → null)
  const updates: Record<string, unknown> = { updated_at: now };
  const keys: Array<keyof FinalMergeData> = [
    "name_ko", "name_en", "country", "country_ko", "region", "region_ko",
    "wine_type", "producer_ko", "producer_en", "alcohol", "image_url",
  ];
  for (const k of keys) {
    if (k in finalData) {
      const v = finalData[k];
      if (typeof v === "string") {
        updates[k] = v.trim() === "" ? null : v.trim();
      } else {
        updates[k] = v ?? null;
      }
    }
  }
  if ("grape_varieties" in finalData) {
    const gv = finalData.grape_varieties;
    if (Array.isArray(gv)) {
      updates.grape_varieties = gv.map((s) => (s ?? "").trim()).filter((s) => s.length > 0);
    } else if (gv == null) {
      updates.grape_varieties = [];
    }
  }

  // legacy producer 컬럼도 편의상 채움 (producer_ko ?? producer_en)
  if ("producer_ko" in finalData || "producer_en" in finalData) {
    const pko = (updates.producer_ko as string | null | undefined) ?? null;
    const pen = (updates.producer_en as string | null | undefined) ?? null;
    updates.producer = pko || pen || null;
  }

  // source_refs에 raw_wine.id 추가
  const existingRefs = Array.isArray(target.source_refs) ? (target.source_refs as string[]) : [];
  if (!existingRefs.includes(candidate.raw_wine_id)) {
    updates.source_refs = [...existingRefs, candidate.raw_wine_id];
  }

  // 4) wines UPDATE
  const { error: uErr } = await supabase
    .from("wines")
    .update(updates)
    .eq("id", candidate.target_wine_id);
  if (uErr) {
    if (uErr.code === "23505" && uErr.message.includes("wines_name_ko_unique")) {
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
  return { success: true, wine_id: candidate.target_wine_id };
}

/**
 * 다른 와인이라고 판단 — 그냥 반려. raw_wine은 별도 promote 대상으로 남음.
 */
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
