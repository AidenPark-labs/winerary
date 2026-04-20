"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";

export async function resolveReport(id: string, note?: string) {
  const { supabase, user } = await requireAdmin();

  const { error } = await supabase
    .from("wine_reports")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
      resolved_note: note?.trim() || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/admin/reports");
  return { success: true };
}

export async function dismissReport(id: string, note?: string) {
  const { supabase, user } = await requireAdmin();

  const { error } = await supabase
    .from("wine_reports")
    .update({
      status: "dismissed",
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
      resolved_note: note?.trim() || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/admin/reports");
  return { success: true };
}

export async function reopenReport(id: string) {
  const { supabase } = await requireAdmin();

  const { error } = await supabase
    .from("wine_reports")
    .update({
      status: "open",
      resolved_at: null,
      resolved_by: null,
      resolved_note: null,
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/admin/reports");
  return { success: true };
}

export async function resolveAllForWine(wineId: string) {
  const { supabase, user } = await requireAdmin();

  const { error } = await supabase
    .from("wine_reports")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
    })
    .eq("wine_id", wineId)
    .eq("status", "open");

  if (error) return { error: error.message };
  revalidatePath("/admin/reports");
  return { success: true };
}
