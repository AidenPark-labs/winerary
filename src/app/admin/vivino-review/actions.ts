"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";

export async function confirmVivinoMatch(id: string) {
  const { supabase } = await requireAdmin();

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("wines")
    .update({
      vivino_needs_review: false,
      vivino_reviewed_at: now,
      updated_at: now,
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/admin/vivino-review");
  return { success: true };
}

export async function unlinkVivinoMatch(id: string) {
  const { supabase } = await requireAdmin();

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("wines")
    .update({
      vivino_url: null,
      vivino_page_url: null,
      vivino_wine_id: null,
      vivino_rating: null,
      vivino_reviews: null,
      vivino_winery: null,
      vivino_grapes: null,
      vivino_region: null,
      vivino_style: null,
      vivino_alcohol: null,
      vivino_allergens: null,
      vivino_description: null,
      vivino_needs_review: false,
      vivino_reviewed_at: now,
      updated_at: now,
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/admin/vivino-review");
  return { success: true };
}
