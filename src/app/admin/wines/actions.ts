"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function updateWine(id: string, data: Record<string, string | number | null | undefined>) {
  const { supabase } = await requireAdmin();

  const { error } = await supabase
    .from("wines")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/admin/wines");
  return { success: true };
}

interface TermDictEntry { category: string; en: string; ko: string; aliases: string[] }

function normKey(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*/g, " ").trim().toLowerCase().replace(/\s+/g, " ");
}

async function loadTermDict(supabase: SupabaseClient): Promise<Map<string, TermDictEntry>> {
  const map = new Map<string, TermDictEntry>();
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("term_dict")
      .select("category, en, ko, aliases")
      .order("category")
      .order("en")
      .range(offset, offset + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data as Array<{ category: string; en: string; ko: string; aliases: string[] | null }>) {
      const entry: TermDictEntry = { category: r.category, en: r.en, ko: r.ko, aliases: r.aliases ?? [] };
      map.set(`${entry.category}::${normKey(entry.en)}`, entry);
      map.set(`${entry.category}::${normKey(entry.ko)}`, entry);
      for (const a of entry.aliases) if (a) map.set(`${entry.category}::${normKey(a)}`, entry);
    }
    if (data.length < 1000) break;
    offset += data.length;
  }
  return map;
}

function lookup(dict: Map<string, TermDictEntry>, category: string, value: string | null | undefined): TermDictEntry | null {
  if (!value) return null;
  const n = normKey(value);
  return n ? dict.get(`${category}::${n}`) ?? null : null;
}

function cleanGrapeString(s: string): string[] {
  return s
    .split(/[,;]/)
    .map((x) =>
      x.replace(/^\s*\d+(?:\.\d+)?\s*%\s*/, "")
       .replace(/\s*\d+(?:\.\d+)?\s*%\s*$/, "")
       .replace(/\s*\([^)]*\)\s*/g, " ")
       .trim(),
    )
    .filter((x) => x.length > 0 && !/^[\d%.\s]+$/.test(x));
}

const VALID_WINE_TYPES = new Set(["red", "white", "rose", "sparkling", "fortified", "dessert", "other"]);

function inferWineTypeFromStyle(style: string | null | undefined): string | null {
  if (!style) return null;
  const low = style.toLowerCase();
  if (low.includes("rosé") || low.includes("rose")) return "rose";
  if (low.includes("red")) return "red";
  if (low.includes("white")) return "white";
  if (low.includes("sparkling") || low.includes("champagne")) return "sparkling";
  if (low.includes("dessert")) return "dessert";
  if (low.includes("fortified") || low.includes("port") || low.includes("sherry") || low.includes("madeira")) return "fortified";
  return null;
}

export async function updateWineVivino(
  id: string,
  data: {
    vivino_url?: string | null;
    vivino_page_url?: string | null;
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
  }
) {
  const { supabase } = await requireAdmin();

  const { data: current, error: curErr } = await supabase
    .from("wines")
    .select("country, country_ko, region_path, region_ko, grape_varieties, grape_varieties_ko, wine_type, wine_style, wine_style_ko, winery_en_clean")
    .eq("id", id)
    .single();
  if (curErr || !current) return { error: "와인을 찾을 수 없습니다" };

  const dict = await loadTermDict(supabase);

  const updates: Record<string, unknown> = {
    ...data,
    updated_at: new Date().toISOString(),
  };

  // vivino_region → country, region_path, country_ko, region_ko
  if (data.vivino_region) {
    const segments = data.vivino_region.split("/").map((s) => s.trim()).filter(Boolean);
    const countryCandidate = segments[0] ?? null;
    const finestRegion = segments.length > 1 ? segments[segments.length - 1] : null;

    if (!current.country && countryCandidate) updates.country = countryCandidate;
    if (!current.country_ko && countryCandidate) {
      const e = lookup(dict, "country", countryCandidate);
      if (e) updates.country_ko = e.ko;
    }
    if (!current.region_path && finestRegion) updates.region_path = data.vivino_region;
    if (!current.region_ko) {
      for (let i = segments.length - 1; i >= 1; i--) {
        const e = lookup(dict, "region", segments[i]);
        if (e) { updates.region_ko = e.ko; break; }
      }
    }
  }

  // vivino_grapes → grape_varieties[], grape_varieties_ko[]
  if (data.vivino_grapes) {
    const grapes = cleanGrapeString(data.vivino_grapes);
    if (grapes.length > 0) {
      const currentGv = (current.grape_varieties as string[] | null) ?? [];
      if (currentGv.length === 0) updates.grape_varieties = grapes;

      const currentGvKo = (current.grape_varieties_ko as string[] | null) ?? [];
      if (currentGvKo.length === 0) {
        const gvKo: string[] = [];
        for (const g of grapes) {
          const e = lookup(dict, "grape", g);
          if (e && !gvKo.includes(e.ko)) gvKo.push(e.ko);
        }
        if (gvKo.length > 0) updates.grape_varieties_ko = gvKo;
      }
    }
  }

  // vivino_style → wine_style, wine_style_ko, wine_type
  if (data.vivino_style) {
    if (!current.wine_style) updates.wine_style = data.vivino_style;
    if (!current.wine_style_ko) {
      for (const cand of ["Red", "White", "Rose", "Rosé", "Sparkling", "Dessert", "Fortified"]) {
        if (data.vivino_style.toLowerCase().includes(cand.toLowerCase())) {
          const e = lookup(dict, "style", cand);
          if (e) { updates.wine_style_ko = e.ko; break; }
        }
      }
    }
    if (!current.wine_type) {
      const inferred = inferWineTypeFromStyle(data.vivino_style);
      if (inferred && VALID_WINE_TYPES.has(inferred)) updates.wine_type = inferred;
    }
  }

  // vivino_winery → winery_en_clean (기본 복사; 정제는 수동 또는 Phase 3 스크립트가 담당)
  if (data.vivino_winery && !current.winery_en_clean) {
    updates.winery_en_clean = data.vivino_winery;
  }

  const { error } = await supabase.from("wines").update(updates).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/wines");
  return { success: true };
}

export async function deleteWine(id: string) {
  const { supabase } = await requireAdmin();

  const { error } = await supabase
    .from("wines")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };
  return { success: true };
}
