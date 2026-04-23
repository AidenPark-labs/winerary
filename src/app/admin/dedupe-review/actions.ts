"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";

export type MergeDirection = "keep_target" | "use_raw";

/**
 * 같은 와인 확정 — raw_wine을 target wine으로 merge.
 *
 * direction:
 *   - "keep_target" (기본): target의 빈 필드만 raw로 채움. 기존 값 유지.
 *   - "use_raw": raw의 non-null 필드로 target 덮어쓰기. raw 쪽 정보가 더 정확할 때.
 *
 * 공통 동작:
 *   - raw_wines.promoted_wine_id = target_wine_id (+ promoted_at)
 *   - grape_varieties 합집합 (direction 무관)
 *   - source_refs에 raw_wine.id 추가
 *   - candidate.status = 'confirmed'
 *
 * Vivino 필드는 어느 방향이든 건드리지 않음 (vivino-review 전용 경로).
 */
export async function confirmDedupe(
  candidateId: string,
  direction: MergeDirection = "keep_target",
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

  // 2) raw_wine + target_wine 조회
  const [rawRes, winesRes] = await Promise.all([
    supabase.from("raw_wines").select("*").eq("id", candidate.raw_wine_id).single(),
    supabase.from("wines").select("*").eq("id", candidate.target_wine_id).single(),
  ]);
  if (rawRes.error || !rawRes.data) return { error: "raw_wine을 찾을 수 없습니다" };
  if (winesRes.error || !winesRes.data) return { error: "target wine을 찾을 수 없습니다" };

  const raw = rawRes.data as Record<string, unknown>;
  const wine = winesRes.data as Record<string, unknown>;

  // 3) 병합 업데이트 값 구성
  const updates: Record<string, unknown> = { updated_at: now };

  // direction=keep_target: 빈 필드만 채움
  const fillIfEmpty = (key: string, value: unknown) => {
    if (value == null || value === "") return;
    if (wine[key] == null || wine[key] === "") updates[key] = value;
  };
  // direction=use_raw: raw 값이 있으면 덮어쓰기
  const overwriteIfRaw = (key: string, value: unknown) => {
    if (value == null || value === "") return;
    // 기존 값과 같으면 skip (UPDATE 최소화)
    if (wine[key] === value) return;
    updates[key] = value;
  };
  const apply = direction === "use_raw" ? overwriteIfRaw : fillIfEmpty;

  apply("name_ko", raw.name_ko);
  apply("name_en", raw.name_en);
  apply("producer_ko", raw.producer_ko);
  apply("producer_en", raw.producer_en);
  apply("country", raw.country);
  apply("region", raw.region);
  apply("wine_type", raw.wine_type);
  apply("image_url", raw.image_url);
  apply("alcohol", raw.alcohol);

  // grape_varieties: 방향 무관하게 union (다양한 표기 모으기가 대개 유익)
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
    if (uErr) {
      if (uErr.code === "23505" && uErr.message.includes("wines_name_ko_unique")) {
        return { error: "이미 사용 중인 한국어명입니다 — raw 쪽 name_ko가 다른 wines와 충돌" };
      }
      return { error: `wines 병합 실패: ${uErr.message}` };
    }
  }

  // 5) raw_wines.promoted_wine_id 연결
  const { error: rawErr } = await supabase
    .from("raw_wines")
    .update({ promoted_wine_id: candidate.target_wine_id, promoted_at: now })
    .eq("id", candidate.raw_wine_id);
  if (rawErr) return { error: `raw_wines 연결 실패: ${rawErr.message}` };

  // 6) 후보 상태 업데이트
  const noteWithDir = direction === "use_raw"
    ? `[raw 반영] ${note?.trim() ?? ""}`.trim()
    : (note?.trim() || null);
  const { error: statErr } = await supabase
    .from("wine_dedupe_candidates")
    .update({
      status: "confirmed",
      reviewed_at: now,
      reviewed_by: user.id,
      reviewed_note: noteWithDir || null,
    })
    .eq("id", candidateId);
  if (statErr) return { error: `상태 업데이트 실패: ${statErr.message}` };

  revalidatePath("/admin/dedupe-review");
  return { success: true, direction };
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
