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
  return { id: record.id };
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

export async function updateRecordOwnerEvaluation(
  recordId: string,
  data: {
    rating: number | null;
    value_score: number | null;
    pairing_score: number | null;
    memo: string | null;
    repurchase_intent: string | null;
  },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("wine_records")
    .update({
      rating: data.rating,
      value_score: data.value_score,
      pairing_score: data.pairing_score,
      memo: data.memo,
      repurchase_intent: data.repurchase_intent,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recordId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath(`/diary/${recordId}`);
  revalidatePath("/diary");
  return { success: true };
}

export async function resetRecordOwnerEvaluation(recordId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("wine_records")
    .update({
      rating: null,
      value_score: null,
      pairing_score: null,
      memo: null,
      repurchase_intent: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recordId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath(`/diary/${recordId}`);
  revalidatePath("/diary");
  return { success: true };
}

export async function deleteRecordEvaluation(recordId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("record_evaluations")
    .delete()
    .eq("record_id", recordId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath(`/diary/${recordId}`);
  return { success: true };
}

export async function upsertRecordEvaluation(
  recordId: string,
  data: { rating: number | null; value_score: number | null; pairing_score: number | null; memo: string | null; repurchase_intent: string | null },
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
        pairing_score: data.pairing_score,
        memo: data.memo || null,
        repurchase_intent: data.repurchase_intent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "record_id,user_id" },
    );

  if (error) return { error: error.message };
  revalidatePath(`/diary/${recordId}`);
  return { success: true };
}

// ─── Shared Experience (경험 연결) ────────────────────────────────────────────

export async function linkRecords(myRecordId: string, targetRecordId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // 내 기록인지 확인
  const { data: myRecord } = await supabase
    .from("wine_records")
    .select("id, user_id")
    .eq("id", myRecordId)
    .eq("user_id", user.id)
    .single();
  if (!myRecord) return { error: "본인 기록만 연결할 수 있습니다" };

  // 대상 기록 존재 확인
  const { data: targetRecord } = await supabase
    .from("wine_records")
    .select("id")
    .eq("id", targetRecordId)
    .is("deleted_at", null)
    .single();
  if (!targetRecord) return { error: "대상 기록을 찾을 수 없습니다" };

  // 이미 같은 experience에 있는지 확인
  const { data: myLinks } = await supabase
    .from("shared_experience_records")
    .select("experience_id")
    .eq("record_id", myRecordId);
  const { data: targetLinks } = await supabase
    .from("shared_experience_records")
    .select("experience_id")
    .eq("record_id", targetRecordId);

  const myExpId = myLinks?.[0]?.experience_id ?? null;
  const targetExpId = targetLinks?.[0]?.experience_id ?? null;

  // 이미 같은 그룹
  if (myExpId && targetExpId && myExpId === targetExpId) {
    return { success: true, experienceId: myExpId };
  }

  let experienceId: string;

  if (myExpId && !targetExpId) {
    // 내 기록이 이미 그룹에 있으면 대상을 합류
    experienceId = myExpId;
    const { error } = await supabase.from("shared_experience_records").insert({
      experience_id: experienceId,
      record_id: targetRecordId,
      linked_by: user.id,
    });
    if (error) return { error: error.message };
  } else if (!myExpId && targetExpId) {
    // 대상이 이미 그룹에 있으면 내 기록을 합류
    experienceId = targetExpId;
    const { error } = await supabase.from("shared_experience_records").insert({
      experience_id: experienceId,
      record_id: myRecordId,
      linked_by: user.id,
    });
    if (error) return { error: error.message };
  } else if (myExpId && targetExpId) {
    // 둘 다 다른 그룹 → 대상 그룹의 기록들을 내 그룹으로 이동
    experienceId = myExpId;
    const { data: targetMembers } = await supabase
      .from("shared_experience_records")
      .select("record_id, linked_by")
      .eq("experience_id", targetExpId);
    for (const m of targetMembers ?? []) {
      await supabase.from("shared_experience_records").upsert({
        experience_id: experienceId,
        record_id: m.record_id,
        linked_by: m.linked_by,
      }, { onConflict: "experience_id,record_id" });
    }
    // 빈 그룹 삭제
    await supabase.from("shared_experiences").delete().eq("id", targetExpId);
  } else {
    // 둘 다 그룹 없음 → 새 그룹 생성
    const { data: exp, error: expErr } = await supabase
      .from("shared_experiences")
      .insert({})
      .select("id")
      .single();
    if (expErr || !exp) return { error: expErr?.message ?? "그룹 생성 실패" };
    experienceId = exp.id;
    const { error } = await supabase.from("shared_experience_records").insert([
      { experience_id: experienceId, record_id: myRecordId, linked_by: user.id },
      { experience_id: experienceId, record_id: targetRecordId, linked_by: user.id },
    ]);
    if (error) return { error: error.message };
  }

  revalidatePath(`/diary/${myRecordId}`);
  revalidatePath(`/diary/${targetRecordId}`);
  return { success: true, experienceId };
}

export async function unlinkRecord(recordId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // 내 기록인지 확인
  const { data: record } = await supabase
    .from("wine_records")
    .select("id, user_id")
    .eq("id", recordId)
    .eq("user_id", user.id)
    .single();
  if (!record) return { error: "본인 기록만 연결 해제할 수 있습니다" };

  // 현재 연결 찾기
  const { data: link } = await supabase
    .from("shared_experience_records")
    .select("id, experience_id")
    .eq("record_id", recordId)
    .single();
  if (!link) return { error: "연결된 경험이 없습니다" };

  // 삭제
  await supabase.from("shared_experience_records").delete().eq("id", link.id);

  // 남은 멤버 확인 → 1개 이하면 그룹 자체 삭제
  const { count } = await supabase
    .from("shared_experience_records")
    .select("id", { count: "exact", head: true })
    .eq("experience_id", link.experience_id);

  if ((count ?? 0) <= 1) {
    // 남은 1개도 삭제하고 그룹 삭제 (CASCADE로 자동 처리)
    await supabase.from("shared_experiences").delete().eq("id", link.experience_id);
  }

  revalidatePath(`/diary/${recordId}`);
  return { success: true };
}

export async function searchLinkableRecords(recordId: string, query: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", records: [] };

  // 내 기록의 날짜 조회
  const { data: myRecord } = await supabase
    .from("wine_records")
    .select("drunk_at")
    .eq("id", recordId)
    .eq("user_id", user.id)
    .single();
  if (!myRecord) return { error: "기록을 찾을 수 없습니다", records: [] };

  // 같은 날짜의 다른 유저 기록 검색 (닉네임 or 와인명으로 필터)
  const { data: results } = await supabase
    .from("wine_records")
    .select("id, name, photos, drunk_at, user_id, profiles:user_id(nickname)")
    .eq("drunk_at", myRecord.drunk_at)
    .neq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  const filtered = (results ?? [])
    .map((r: Record<string, unknown>) => {
      const profile = r.profiles as { nickname: string } | null;
      return {
        id: r.id as string,
        name: r.name as string,
        photos: (r.photos as string[]) ?? [],
        drunk_at: r.drunk_at as string,
        owner_nickname: profile?.nickname ?? "알 수 없음",
      };
    })
    .filter((r) => {
      if (!query) return true;
      return r.name.includes(query) || r.owner_nickname.includes(query);
    });

  return { records: filtered };
}

export async function generateInviteCode(recordId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const { error } = await supabase
    .from("wine_records")
    .update({ invite_code: code })
    .eq("id", recordId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath(`/diary/${recordId}`);
  return { code };
}
