"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import {
  promoteSingleRawWine,
  insertWineDirectly,
  type RawWineInput,
  type PromoteOutcome,
  type InsertWineOutcome,
} from "@/lib/promote-raw-wine";

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
 * 어드민이 wines에 직접 추가 (raw_wines 안 거침).
 * raw_wines는 크롤링 원본 전용이므로 admin/user 기원은 wines에 직접 INSERT.
 */
export async function createAdminWine(input: {
  name_ko: string;
  name_en: string;
  country: string;
  grape_variety?: string;
  region?: string;
  wine_type?: string;
  producer_ko?: string;
  producer_en?: string;
  image_url?: string;
}): Promise<{ success: true; outcome: InsertWineOutcome } | { error: string }> {
  const { supabase } = await requireAdmin();

  const outcome = await insertWineDirectly(supabase, {
    name_ko: input.name_ko,
    name_en: input.name_en,
    country: input.country,
    region: input.region,
    wine_type: input.wine_type,
    grape_variety: input.grape_variety,
    producer_ko: input.producer_ko,
    producer_en: input.producer_en,
    image_url: input.image_url,
    data_source: "admin",
  });

  revalidatePath("/admin/raw-wines");
  revalidatePath("/admin/wines");
  if (outcome.kind === "error") return { error: outcome.message };
  if (outcome.kind === "missing_fields") {
    return { error: `필수 필드 부족: ${outcome.missing.join(", ")}` };
  }
  return { success: true, outcome };
}
