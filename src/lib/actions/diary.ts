"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { WineRecord, CompanionEntry } from "@/types";

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

/** companions 중 멘션된 유저를 record_mentions에 동기화 */
async function syncMentions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  recordId: string,
  companionEntries: CompanionEntry[] | null,
) {
  // 기존 멘션 삭제
  await supabase.from("record_mentions").delete().eq("record_id", recordId);

  if (!companionEntries?.length) return;

  const userCodes = companionEntries
    .map((e) => e.userCode)
    .filter((c): c is string => c !== null);

  if (userCodes.length === 0) return;

  // user_code → user_id 조회
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, user_code")
    .in("user_code", userCodes);

  if (!profiles?.length) return;

  const rows = profiles.map((p) => ({
    record_id: recordId,
    mentioned_user_id: p.id,
  }));

  await supabase.from("record_mentions").insert(rows);
}

export async function createWineRecord(data: Partial<WineRecord> & { companion_entries?: CompanionEntry[] }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // wine_id가 없으면 pending_wines에서 처리
  let pendingWineId: string | null = null;
  if (!data.wine_id) {
    pendingWineId = await resolvePendingWine(supabase, user.id, data);
  }

  const companionEntries = data.companion_entries;
  const insertData = { ...data };
  delete (insertData as Record<string, unknown>).companion_entries;

  const { data: record, error } = await supabase
    .from("wine_records")
    .insert({
      ...insertData,
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

  await syncMentions(supabase, record.id, companionEntries ?? null);
  redirect(`/diary/${record.id}`);
}

export async function updateWineRecord(id: string, data: Partial<WineRecord> & { companion_entries?: CompanionEntry[] }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const companionEntries = data.companion_entries;
  const updateData = { ...data };
  delete (updateData as Record<string, unknown>).companion_entries;

  const { error } = await supabase
    .from("wine_records")
    .update({ ...updateData, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  if (companionEntries !== undefined) {
    await syncMentions(supabase, id, companionEntries ?? null);
  }

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

export async function upsertRecordEvaluation(
  recordId: string,
  data: { rating: number | null; value_score: number | null; memo: string | null },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("record_evaluations")
    .upsert(
      {
        record_id: recordId,
        user_id: user.id,
        rating: data.rating,
        value_score: data.value_score,
        memo: data.memo || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "record_id,user_id" },
    );

  if (error) return { error: error.message };
  revalidatePath(`/diary/${recordId}`);
  return { success: true };
}
