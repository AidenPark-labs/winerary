"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";

/**
 * 특정 wine_id의 vivino_wines 매칭 해제 (잘못 매칭된 경우).
 * vivino_wines 행 DELETE.
 */
export async function unlinkVivino(wineId: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("vivino_wines").delete().eq("wine_id", wineId);
  if (error) return { error: error.message };
  revalidatePath("/admin/vivino-dup-review");
  return { success: true };
}
