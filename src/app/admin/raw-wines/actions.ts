"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { promoteSingleRawWine, type RawWineInput, type PromoteOutcome } from "@/lib/promote-raw-wine";

/**
 * raw_wines 단건 필드 업데이트 (어드민이 결손 필드 채우기)
 */
export async function updateRawWine(
  id: string,
  data: Partial<Pick<RawWineInput, "name_ko" | "name_en" | "country" | "region" | "wine_type" | "grape_variety" | "producer_ko" | "producer_en" | "image_url" | "price">>,
) {
  const { supabase } = await requireAdmin();
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    payload[k] = v === "" ? null : v;
  }
  const { error } = await supabase.from("raw_wines").update(payload).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/raw-wines");
  return { success: true };
}

/**
 * raw_wine 단건 승격 시도 — promote-v2와 동일한 정책으로.
 */
export async function promoteRawWine(id: string): Promise<{ success: true; outcome: PromoteOutcome } | { error: string }> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("raw_wines")
    .select("id, source, name_ko, name_en, country, region, wine_type, grape_variety, producer_ko, producer_en, image_url, price, raw_payload, promoted_wine_id")
    .eq("id", id)
    .single();
  if (error || !data) return { error: error?.message ?? "raw_wine을 찾을 수 없음" };

  const outcome = await promoteSingleRawWine(supabase, data as RawWineInput);
  revalidatePath("/admin/raw-wines");
  return { success: true, outcome };
}

/**
 * 어드민이 신규 raw_wine 추가 (source='admin').
 * 생성 직후 자동 승격 시도.
 */
export async function createAdminRawWine(input: {
  name_ko: string;
  name_en: string;
  country: string;
  grape_variety?: string;
  region?: string;
  wine_type?: string;
  producer_ko?: string;
  producer_en?: string;
  image_url?: string;
}): Promise<{ success: true; raw_id: string; outcome: PromoteOutcome } | { error: string }> {
  const { supabase } = await requireAdmin();

  // source_id는 고유 — admin은 타임스탬프+랜덤 조합
  const source_id = `admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const payload: Record<string, unknown> = {
    source: "admin",
    source_id,
    name_ko: input.name_ko.trim(),
    name_en: input.name_en.trim(),
    country: input.country.trim(),
    region: input.region?.trim() || null,
    wine_type: input.wine_type?.trim() || null,
    grape_variety: input.grape_variety?.trim() || null,
    producer_ko: input.producer_ko?.trim() || null,
    producer_en: input.producer_en?.trim() || null,
    image_url: input.image_url?.trim() || null,
    raw_payload: { created_via: "admin_manual", created_at: new Date().toISOString() },
  };

  const { data, error } = await supabase.from("raw_wines").insert(payload).select("id").single();
  if (error) return { error: `raw_wine 생성 실패: ${error.message}` };
  const rawId = (data as { id: string }).id;

  // 자동 승격 시도
  const promoteResult = await promoteRawWine(rawId);
  revalidatePath("/admin/raw-wines");
  if ("error" in promoteResult) return { error: promoteResult.error };
  return { success: true, raw_id: rawId, outcome: promoteResult.outcome };
}
