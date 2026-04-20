"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { WineRecord, CompanionEntry } from "@/types";

function createAdminDb() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

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
    .select("id, record_count, status, name_en")
    .eq("name_ko", name)
    .eq("status", "pending")
    .limit(1)
    .single();

  if (existing) {
    const newCount = (existing.record_count ?? 1) + 1;
    const updates: Record<string, unknown> = { record_count: newCount, updated_at: new Date().toISOString() };
    if (!existing.name_en && data.wine_name_original) {
      updates.name_en = data.wine_name_original;
    }
    await supabase
      .from("pending_wines")
      .update(updates)
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

  // 연결 가능 기록 검색: 상대방이 나를 멘션 + 같은 날짜
  let linkable: { recordId: string; wineName: string; ownerNickname: string }[] = [];
  try {
    const adminDb = createAdminDb();
    const { data: mentionedBy } = await adminDb
      .from("record_mentions")
      .select("record_id")
      .eq("mentioned_user_id", user.id);

    if (mentionedBy && mentionedBy.length > 0) {
      const mentionRecordIds = mentionedBy.map((m: { record_id: string }) => m.record_id);
      const { data: candidates } = await adminDb
        .from("wine_records")
        .select("id, name, user_id")
        .in("id", mentionRecordIds)
        .eq("drunk_at", data.drunk_at)
        .neq("user_id", user.id)
        .is("deleted_at", null);

      if (candidates && candidates.length > 0) {
        const uids = [...new Set(candidates.map((c: { user_id: string }) => c.user_id))];
        const { data: profiles } = await adminDb.from("profiles").select("id, nickname").in("id", uids);
        const nickMap: Record<string, string> = {};
        (profiles ?? []).forEach((p: { id: string; nickname: string }) => { nickMap[p.id] = p.nickname; });

        linkable = candidates.map((c: { id: string; name: string; user_id: string }) => ({
          recordId: c.id,
          wineName: c.name,
          ownerNickname: nickMap[c.user_id] ?? "알 수 없음",
        }));
      }
    }
  } catch {
    // 연결 검색 실패 시 무시
  }

  return { id: record.id, linkable };
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
    .from("evaluations")
    .delete()
    .eq("record_id", recordId)
    .eq("user_id", user.id)
    .eq("role", "guest");

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

  const { data: record } = await supabase
    .from("wine_records")
    .select("wine_id, pending_wine_id")
    .eq("id", recordId)
    .single();
  if (!record) return { error: "기록을 찾을 수 없습니다" };

  const { error } = await supabase
    .from("evaluations")
    .upsert(
      {
        record_id: recordId,
        wine_id: record.wine_id,
        pending_wine_id: record.pending_wine_id,
        user_id: user.id,
        role: "guest",
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

  // RLS를 우회하는 서비스 클라이언트 (shared_experience 테이블 조작용)
  const adminDb = createAdminDb();

  // 이미 같은 experience에 있는지 확인
  const { data: myLinks } = await adminDb
    .from("shared_experience_records")
    .select("experience_id")
    .eq("record_id", myRecordId);
  const { data: targetLinks } = await adminDb
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
    experienceId = myExpId;
    const { error } = await adminDb.from("shared_experience_records").insert({
      experience_id: experienceId,
      record_id: targetRecordId,
      linked_by: user.id,
    });
    if (error) return { error: error.message };
  } else if (!myExpId && targetExpId) {
    experienceId = targetExpId;
    const { error } = await adminDb.from("shared_experience_records").insert({
      experience_id: experienceId,
      record_id: myRecordId,
      linked_by: user.id,
    });
    if (error) return { error: error.message };
  } else if (myExpId && targetExpId) {
    experienceId = myExpId;
    const { data: targetMembers } = await adminDb
      .from("shared_experience_records")
      .select("record_id, linked_by")
      .eq("experience_id", targetExpId);
    for (const m of targetMembers ?? []) {
      await adminDb.from("shared_experience_records").upsert({
        experience_id: experienceId,
        record_id: m.record_id,
        linked_by: m.linked_by,
      }, { onConflict: "experience_id,record_id" });
    }
    await adminDb.from("shared_experiences").delete().eq("id", targetExpId);
  } else {
    const { data: exp, error: expErr } = await adminDb
      .from("shared_experiences")
      .insert({})
      .select("id")
      .single();
    if (expErr || !exp) return { error: expErr?.message ?? "그룹 생성 실패" };
    experienceId = exp.id;
    const { error } = await adminDb.from("shared_experience_records").insert([
      { experience_id: experienceId, record_id: myRecordId, linked_by: user.id },
      { experience_id: experienceId, record_id: targetRecordId, linked_by: user.id },
    ]);
    if (error) return { error: error.message };
  }

  // 연결 후 중복 평가 정리 + 미평가 시 게스트 평가 복사 (v3: evaluations role='guest')
  const { data: myGuestEval } = await adminDb
    .from("evaluations")
    .select("rating, value_score, pairing_score, memo, repurchase_intent")
    .eq("record_id", targetRecordId)
    .eq("user_id", user.id)
    .eq("role", "guest")
    .maybeSingle();

  if (myGuestEval) {
    const { data: myRecordData } = await adminDb
      .from("wine_records")
      .select("rating")
      .eq("id", myRecordId)
      .single();
    if (myRecordData && myRecordData.rating == null) {
      await adminDb
        .from("wine_records")
        .update({
          rating: myGuestEval.rating,
          value_score: myGuestEval.value_score,
          pairing_score: myGuestEval.pairing_score,
          memo: myGuestEval.memo,
          repurchase_intent: myGuestEval.repurchase_intent,
          updated_at: new Date().toISOString(),
        })
        .eq("id", myRecordId);
    }
    await adminDb
      .from("evaluations")
      .delete()
      .eq("record_id", targetRecordId)
      .eq("user_id", user.id)
      .eq("role", "guest");
  }

  const { data: targetOwner } = await adminDb
    .from("wine_records")
    .select("user_id, rating")
    .eq("id", targetRecordId)
    .single();
  if (targetOwner) {
    const { data: theirGuestEval } = await adminDb
      .from("evaluations")
      .select("rating, value_score, pairing_score, memo, repurchase_intent")
      .eq("record_id", myRecordId)
      .eq("user_id", targetOwner.user_id)
      .eq("role", "guest")
      .maybeSingle();

    if (theirGuestEval) {
      if (targetOwner.rating == null) {
        await adminDb
          .from("wine_records")
          .update({
            rating: theirGuestEval.rating,
            value_score: theirGuestEval.value_score,
            pairing_score: theirGuestEval.pairing_score,
            memo: theirGuestEval.memo,
            repurchase_intent: theirGuestEval.repurchase_intent,
            updated_at: new Date().toISOString(),
          })
          .eq("id", targetRecordId);
      }
      await adminDb
        .from("evaluations")
        .delete()
        .eq("record_id", myRecordId)
        .eq("user_id", targetOwner.user_id)
        .eq("role", "guest");
    }
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

  const adminDb = createAdminDb();

  // 현재 연결 찾기
  const { data: link } = await adminDb
    .from("shared_experience_records")
    .select("id, experience_id")
    .eq("record_id", recordId)
    .single();
  if (!link) return { error: "연결된 경험이 없습니다" };

  await adminDb.from("shared_experience_records").delete().eq("id", link.id);

  const { count } = await adminDb
    .from("shared_experience_records")
    .select("id", { count: "exact", head: true })
    .eq("experience_id", link.experience_id);

  if ((count ?? 0) <= 1) {
    await adminDb.from("shared_experiences").delete().eq("id", link.experience_id);
  }

  revalidatePath(`/diary/${recordId}`);
  return { success: true };
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
