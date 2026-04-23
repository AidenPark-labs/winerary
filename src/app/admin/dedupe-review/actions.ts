"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";

/**
 * 같은 와인 확정 — raw_wine을 target wine으로 merge.
 * 동작:
 *   1) raw_wines.promoted_wine_id = target_wine_id (+ promoted_at)
 *   2) target wines의 빈 필드를 raw_wines 값으로 채움 (기존 값 덮어쓰지 않음)
 *   3) grape_varieties 합집합
 *   4) source_refs[] 에 raw_wine.id 추가 (없으면 신규)
 *   5) candidate.status = 'confirmed'
 */
export async function confirmDedupe(candidateId: string, note?: string) {
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

  // 2) raw_wine + target_wine 조회
  const [rawRes, winesRes] = await Promise.all([
    supabase.from("raw_wines").select("*").eq("id", candidate.raw_wine_id).single(),
    supabase.from("wines").select("*").eq("id", candidate.target_wine_id).single(),
  ]);
  if (rawRes.error || !rawRes.data) return { error: "raw_wine을 찾을 수 없습니다" };
  if (winesRes.error || !winesRes.data) return { error: "target wine을 찾을 수 없습니다" };

  const raw = rawRes.data as Record<string, unknown>;
  const wine = winesRes.data as Record<string, unknown>;

  // 3) 병합 업데이트 값 구성 (target의 빈 필드만 채움)
  const updates: Record<string, unknown> = { updated_at: now };
  const fillIfEmpty = (key: string, value: unknown) => {
    if (value == null || value === "") return;
    if (wine[key] == null || wine[key] === "") updates[key] = value;
  };

  fillIfEmpty("name_ko", raw.name_ko);
  fillIfEmpty("name_en", raw.name_en);
  fillIfEmpty("producer_ko", raw.producer_ko);
  fillIfEmpty("producer_en", raw.producer_en);
  fillIfEmpty("country", raw.country);
  fillIfEmpty("region", raw.region);
  fillIfEmpty("wine_type", raw.wine_type);
  fillIfEmpty("image_url", raw.image_url);
  fillIfEmpty("alcohol", raw.alcohol);

  // grape_varieties 합집합 (raw.grape_variety가 단수 문자열이면 배열로 변환)
  const existingGrapes = Array.isArray(wine.grape_varieties) ? (wine.grape_varieties as string[]) : [];
  const rawGrapes: string[] = [];
  if (Array.isArray(raw.grape_varieties)) rawGrapes.push(...(raw.grape_varieties as string[]));
  if (typeof raw.grape_variety === "string" && raw.grape_variety.trim()) {
    rawGrapes.push(
      ...raw.grape_variety.split(/[,;/]/).map((s: string) => s.trim()).filter(Boolean),
    );
  }
  const merged = Array.from(new Set([...existingGrapes, ...rawGrapes].map((g) => g.trim()).filter(Boolean)));
  if (merged.length > existingGrapes.length) {
    updates.grape_varieties = merged;
  }

  // source_refs에 raw_wine.id 추가
  const existingRefs = Array.isArray(wine.source_refs) ? (wine.source_refs as string[]) : [];
  if (!existingRefs.includes(candidate.raw_wine_id)) {
    updates.source_refs = [...existingRefs, candidate.raw_wine_id];
  }

  // 4) wines UPDATE
  if (Object.keys(updates).length > 1) {
    const { error: uErr } = await supabase
      .from("wines")
      .update(updates)
      .eq("id", candidate.target_wine_id);
    if (uErr) return { error: `wines 병합 실패: ${uErr.message}` };
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
  return { success: true };
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
