"use server";

import { requireAdmin } from "@/lib/admin";

export async function updateWine(id: string, data: Record<string, string | number | null | undefined>) {
  const { supabase } = await requireAdmin();

  const { error } = await supabase
    .from("wines")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: error.message };
  return { success: true };
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

  const { error } = await supabase
    .from("wines")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: error.message };
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
