"use server";

import { requireAdmin } from "@/lib/admin";

export async function updateWine(id: string, data: { vivino_url?: string | null; vivino_rating?: number | null; vivino_reviews?: number | null }) {
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
