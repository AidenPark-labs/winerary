"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { WineRecord } from "@/types";

const PROMOTE_THRESHOLD = 3;

/** pending_wines에서 매칭하거나 신규 생성하고 pending_wine_id를 반환 */
async function resolvePendingWine(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  data: Partial<WineRecord>,
): Promise<string | null> {
  const name = data.name?.replace(/[\u200b\u200c\u200d\ufeff]/g, "").trim();
  if (!name) return null;

  // 기존 pending_wine 검색 (이름 정규화 비교)
  const { data: existing } = await supabase
    .from("pending_wines")
    .select("id, record_count, status")
    .eq("name_ko", name)
    .eq("status", "pending")
    .limit(1)
    .single();

  if (existing) {
    const newCount = (existing.record_count ?? 1) + 1;
    await supabase
      .from("pending_wines")
      .update({ record_count: newCount, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    return existing.id;
  }

  // 신규 pending_wine 생성
  const { data: created } = await supabase
    .from("pending_wines")
    .insert({
      name_ko: name,
      name_en: data.wine_name_original || null,
      wine_type: data.wine_type || null,
      country: data.wine_country || null,
      grape_variety: data.grape_variety || null,
      submitted_by: userId,
      record_count: 1,
    })
    .select("id")
    .single();

  return created?.id ?? null;
}

export async function createWineRecord(data: Partial<WineRecord>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // wine_id가 없으면 pending_wines에서 처리
  let pendingWineId: string | null = null;
  if (!data.wine_id) {
    pendingWineId = await resolvePendingWine(supabase, user.id, data);
  }

  const { data: record, error } = await supabase
    .from("wine_records")
    .insert({
      ...data,
      user_id: user.id,
      wine_id: data.wine_id || null,
      pending_wine_id: pendingWineId,
    })
    .select()
    .single();

  if (error) {
    console.error("[createWineRecord] error:", error.message, "data keys:", Object.keys(data));
    return { error: error.message };
  }
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
