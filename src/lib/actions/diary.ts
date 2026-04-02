"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { WineRecord } from "@/types";

export async function createWineRecord(data: Partial<WineRecord>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: record, error } = await supabase
    .from("wine_records")
    .insert({ ...data, user_id: user.id })
    .select()
    .single();

  if (error) return { error: error.message };
  redirect(`/diary/${record.id}`);
}

export async function updateWineRecord(id: string, data: Partial<WineRecord>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("wine_records")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath(`/diary/${id}`);
  revalidatePath("/diary");
  return { success: true };
}

export async function deleteWineRecord(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("wine_records")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  redirect("/diary");
}
