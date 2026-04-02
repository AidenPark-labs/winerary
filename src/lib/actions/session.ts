"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export async function createSession(_prevState: { error: string } | undefined, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const title = formData.get("title") as string;
  const code = generateCode();

  const { error } = await supabase.from("sessions").insert({
    code,
    host_id: user.id,
    title: title || null,
  });

  if (error) return { error: error.message };
  redirect(`/session/${code}`);
}

export async function closeSession(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("sessions")
    .update({ is_active: false })
    .eq("id", id)
    .eq("host_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/diary");
  return { success: true };
}

export async function saveSessionToRecord(sessionId: string, wineRecordId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("wine_records")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", wineRecordId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { success: true };
}
