"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import {
  loadTermDict,
  buildUpdatePatch,
  type WinesV2Input,
  type VivinoInput,
} from "@/lib/wines-v2-transform";

/**
 * v5: 일반 와인 편집 (어드민 폼).
 * 변환 모듈을 통과시켜 자동 정규화 (path 분해, 한·영 변환, grape 비율 분리 등).
 */
export async function updateWine(
  id: string,
  data: Record<string, string | number | boolean | string[] | null | undefined>,
) {
  const { supabase } = await requireAdmin();

  // 현재 행 조회
  const { data: current, error: cErr } = await supabase
    .from("wines")
    .select(
      "name_ko, name_en, wine_type, wine_style, country_ko, region_ko, producer, grape_varieties, grape_blend, alcohol, brand, price, description, image_url, locked_fields, source_refs, source_snapshot",
    )
    .eq("id", id)
    .maybeSingle();
  if (cErr || !current) return { error: "와인을 찾을 수 없습니다" };

  // UI 필드 → WinesV2Input 매핑
  const patch: Partial<WinesV2Input> = {};
  const passthrough: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    switch (k) {
      case "name_ko":
      case "name_en":
        patch[k] = v as string;
        break;
      case "country_ko":
        patch.country = v as string;
        break;
      case "region_ko":
        patch.region = v as string | null;
        break;
      case "producer":
        patch.producer = v as string | null;
        break;
      case "wine_type":
      case "wine_style":
      case "brand":
      case "description":
      case "image_url":
        (patch as Record<string, unknown>)[k] = v;
        break;
      case "grape_varieties":
        if (Array.isArray(v)) patch.grape_varieties = v;
        break;
      case "alcohol":
        patch.alcohol = v as string | number;
        break;
      case "price":
        patch.price = typeof v === "number" ? v : null;
        break;
      case "is_published":
        patch.is_published = v as unknown as boolean;
        break;
      default:
        // 기타 필드는 그대로 (locked_fields 등)
        passthrough[k] = v;
    }
  }

  const dict = await loadTermDict(supabase);
  const result = await buildUpdatePatch(supabase, current as any, patch, { dict });

  const update: Record<string, unknown> = {
    ...result.wineUpdate,
    ...passthrough,
    updated_at: new Date().toISOString(),
  };
  if (result.needs_review_reasons.length === 0 && "needs_review" in update === false) {
    update.needs_review = false;
    update.needs_review_reasons = null;
  }

  const { error } = await supabase.from("wines").update(update).eq("id", id);
  if (error) {
    if (error.code === "23505" && error.message.includes("name_ko")) {
      return { error: "이미 사용 중인 한국어명입니다" };
    }
    if (error.code === "23505") return { error: "중복된 값이 있어 저장할 수 없습니다" };
    return { error: error.message };
  }
  revalidatePath("/admin/wines");
  return { success: true };
}

/**
 * v5: Vivino 매칭 데이터 입력 → vivino_wines UPSERT + wines_v2의 country_ko/region_ko/wine_style 자동 보강.
 */
export async function updateWineVivino(
  id: string,
  data: {
    vivino_url?: string | null;
    vivino_wine_id?: number | null;
    vivino_rating?: number | null;
    vivino_reviews?: number | null;
    vivino_winery?: string | null;
    vivino_grapes?: string | null;
    vivino_region?: string | null;
    vivino_style?: string | null;
    vivino_alcohol?: string | null;
    vivino_allergens?: string | null;
    vivino_description?: string | null;
  },
) {
  const { supabase } = await requireAdmin();

  if (!data.vivino_url || !/vivino\.com/i.test(data.vivino_url)) {
    return { error: "Vivino URL이 필요합니다" };
  }

  const now = new Date().toISOString();

  // wines_v2 행 조회 (자동 보강용)
  const { data: current } = await supabase
    .from("wines")
    .select(
      "name_ko, name_en, wine_type, wine_style, country_ko, region_ko, producer, grape_varieties, grape_blend, alcohol, brand, price, description, image_url, locked_fields, source_refs, source_snapshot",
    )
    .eq("id", id)
    .maybeSingle();
  if (!current) return { error: "와인을 찾을 수 없습니다" };

  // vivino input
  const vivinoInput: VivinoInput = {
    url: data.vivino_url,
    wine_id: data.vivino_wine_id ?? null,
    rating: data.vivino_rating ?? null,
    reviews: data.vivino_reviews ?? null,
    winery: data.vivino_winery ?? null,
    grapes: data.vivino_grapes ?? null,
    region: data.vivino_region ?? null,
    style: data.vivino_style ?? null,
    alcohol: data.vivino_alcohol ?? null,
    description: data.vivino_description ?? null,
    allergens: data.vivino_allergens ?? null,
  };

  // wines_v2 자동 보강 — vivino_region → country/region (빈 필드만)
  const patch: Partial<WinesV2Input> = { vivino: vivinoInput };
  if (data.vivino_region && (!current.country_ko || !current.region_ko)) {
    // path 첫 항목을 country로, 마지막 항목을 region으로
    const segs = data.vivino_region.split("/").map((s) => s.trim()).filter(Boolean);
    if (segs.length > 0 && !current.country_ko) patch.country = segs[0];
    if (segs.length > 1 && !current.region_ko) patch.region = data.vivino_region;
  }
  if (data.vivino_style && !current.wine_style) {
    patch.wine_style = data.vivino_style;
  }

  const dict = await loadTermDict(supabase);
  const result = await buildUpdatePatch(supabase, current as any, patch, {
    dict,
    fillEmptyOnly: true,
  });

  // wines_v2 UPDATE
  if (Object.keys(result.wineUpdate).length > 0) {
    const upd = await supabase
      .from("wines")
      .update({ ...result.wineUpdate, updated_at: now })
      .eq("id", id);
    if (upd.error) return { error: upd.error.message };
  }

  // vivino_wines UPSERT
  if (result.vivinoUpsert) {
    const { data: existing } = await supabase
      .from("vivino_wines")
      .select("wine_id")
      .eq("wine_id", id)
      .maybeSingle();
    if (existing) {
      await supabase
        .from("vivino_wines")
        .update({ ...result.vivinoUpsert, updated_at: now })
        .eq("wine_id", id);
    } else {
      await supabase.from("vivino_wines").insert({ wine_id: id, ...result.vivinoUpsert });
    }
  }

  revalidatePath("/admin/wines");
  return { success: true };
}

/** Vivino 매칭 해제 — vivino_wines DELETE. */
export async function clearWineVivino(id: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("vivino_wines").delete().eq("wine_id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/wines");
  return { success: true };
}

/** 와인 삭제 — wines_v2 + vivino_wines 둘 다 (cascading manual). */
export async function deleteWine(id: string) {
  const { supabase } = await requireAdmin();
  await supabase.from("vivino_wines").delete().eq("wine_id", id);
  const { error } = await supabase.from("wines").delete().eq("id", id);
  if (error) return { error: error.message };
  return { success: true };
}
