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

export async function uploadLabelImage(formData: FormData): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const file = formData.get("file") as File;
  if (!file) return { error: "No file" };

  const ext = file.name.split(".").pop();
  const path = `${user.id}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("labels")
    .upload(path, file, { upsert: true });

  if (error) return { error: error.message };

  const { data: { publicUrl } } = supabase.storage
    .from("labels")
    .getPublicUrl(path);

  return { url: publicUrl };
}
