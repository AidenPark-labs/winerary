import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import DiaryDetail from "./DiaryDetail";
import type { WineRecord, RecordEvaluation, LinkedRecord } from "@/types";

export default async function DiaryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: record } = await supabase
    .from("wine_records")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!record) notFound();

  const isOwner = user?.id === record.user_id;

  // 닉네임 조회
  let ownerNickname = "작성자";
  let currentNickname = "";
  {
    const { data: ownerProfile } = await supabase.from("profiles").select("nickname").eq("id", record.user_id).maybeSingle();
    if (ownerProfile?.nickname) ownerNickname = ownerProfile.nickname;
    if (user && !isOwner) {
      const { data: myProfile } = await supabase.from("profiles").select("nickname").eq("id", user.id).maybeSingle();
      if (myProfile?.nickname) currentNickname = myProfile.nickname;
    } else if (user && isOwner) {
      currentNickname = ownerNickname;
    }
  }

  // v5: wines_v2 + vivino_wines 합성
  const { fetchWineWithVivinoById } = await import("@/lib/wines-v2-fetch");
  let wineData = null;

  if (record.wine_id) {
    wineData = await fetchWineWithVivinoById(supabase, record.wine_id);
  }
  if (!wineData && record.name) {
    const { data: byName } = await supabase
      .from("wines")
      .select("id")
      .eq("name_ko", record.name)
      .maybeSingle();
    if (byName?.id) {
      wineData = await fetchWineWithVivinoById(supabase, byName.id);
    }
  }

  // 평가 데이터 조회
  let evaluations: RecordEvaluation[] = [];
  let myEvaluation: RecordEvaluation | null = null;
  try {
    const { data: evals } = await supabase
      .from("evaluations")
      .select("*, profiles:user_id(nickname)")
      .eq("record_id", id)
      .eq("role", "guest");

    evaluations = (evals ?? []).map((e: unknown) => {
      const row = e as Record<string, unknown>;
      const profile = row.profiles as { nickname: string } | null;
      return {
        id: row.id as string,
        record_id: row.record_id as string,
        user_id: row.user_id as string,
        rating: row.rating as number | null,
        value_score: row.value_score as number | null,
        pairing_score: row.pairing_score as number | null,
        memo: row.memo as string | null,
        repurchase_intent: (row.repurchase_intent as string | null) ?? null,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
        nickname: profile?.nickname ?? undefined,
      };
    });

    if (user) {
      myEvaluation = evaluations.find((e) => e.user_id === user.id) ?? null;
    }
  } catch {
    // 평가 테이블 조회 실패 시 무시
  }

  // 멘션된 유저의 현재 닉네임 조회
  let resolvedCompanions: string[] = record.companions ?? [];
  if (resolvedCompanions.some((c: string) => c.startsWith("@"))) {
    const { data: mentions } = await supabase
      .from("record_mentions")
      .select("mentioned_user_id, profiles:mentioned_user_id(nickname)")
      .eq("record_id", id);

    if (mentions && mentions.length > 0) {
      const nicknameMap = new Map<string, string>();
      for (const m of mentions) {
        const row = m as { mentioned_user_id: string; profiles: { nickname: string } | { nickname: string }[] | null };
        const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        if (p) nicknameMap.set(row.mentioned_user_id, p.nickname);
      }
      // 멘션 항목을 현재 닉네임으로 교체
      const currentNicknames = new Set(nicknameMap.values());
      const plainCompanions = resolvedCompanions.filter((c: string) => !c.startsWith("@"));
      const mentionCompanions = [...currentNicknames].map((n) => `@${n}`);
      resolvedCompanions = [...mentionCompanions, ...plainCompanions];
    }
  }

  // 연결된 경험 기록 조회 (RLS 우회)
  const adminDb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  let linkedRecords: LinkedRecord[] = [];
  try {
    const { data: myLink } = await adminDb
      .from("shared_experience_records")
      .select("experience_id")
      .eq("record_id", id)
      .maybeSingle();

    if (myLink) {
      const { data: siblings } = await adminDb
        .from("shared_experience_records")
        .select("record_id")
        .eq("experience_id", myLink.experience_id)
        .neq("record_id", id);

      if (siblings && siblings.length > 0) {
        const siblingIds = siblings.map((s: { record_id: string }) => s.record_id);
        const { data: siblingRecords } = await supabase
          .from("wine_records")
          .select("id, name, photos, rating, value_score, pairing_score, memo, repurchase_intent, drunk_at, user_id")
          .in("id", siblingIds)
          .is("deleted_at", null);

        for (const sr of siblingRecords ?? []) {
          const { data: profile } = await supabase.from("profiles").select("nickname").eq("id", sr.user_id).maybeSingle();
          linkedRecords.push({
            record_id: sr.id,
            wine_name: sr.name,
            photos: sr.photos ?? [],
            rating: sr.rating,
            value_score: sr.value_score,
            pairing_score: sr.pairing_score,
            memo: sr.memo,
            repurchase_intent: sr.repurchase_intent,
            drunk_at: sr.drunk_at,
            owner_id: sr.user_id,
            owner_nickname: profile?.nickname ?? "알 수 없음",
          });
        }
      }
    }
  } catch {
    // 연결 조회 실패 시 무시
  }

  // 공유받은 기록 + 연결 안 됨 → 내 같은 날짜 기록 유사도 체크
  let hasMatchingRecord = false;
  if (!isOwner && user && linkedRecords.length === 0) {
    try {
      const { data: myDateRecords } = await supabase
        .from("wine_records")
        .select("name, wine_id")
        .eq("user_id", user.id)
        .eq("drunk_at", record.drunk_at)
        .is("deleted_at", null);

      if (myDateRecords && myDateRecords.length > 0) {
        const sharedName = (record.name ?? "").toLowerCase().replace(/\s/g, "");
        hasMatchingRecord = myDateRecords.some((r: { name: string; wine_id: string | null }) => {
          if (record.wine_id && r.wine_id && record.wine_id === r.wine_id) return true;
          const myName = (r.name ?? "").toLowerCase().replace(/\s/g, "");
          if (myName === sharedName) return true;
          if (myName.includes(sharedName) || sharedName.includes(myName)) return true;
          const shorter = myName.length < sharedName.length ? myName : sharedName;
          const longer = myName.length < sharedName.length ? sharedName : myName;
          let matches = 0;
          for (const ch of shorter) { if (longer.includes(ch)) matches++; }
          return matches / longer.length >= 0.4;
        });
      }
    } catch {
      // 무시
    }
  }

  return (
    <DiaryDetail
      record={record as WineRecord}
      readOnly={!isOwner}
      wineData={wineData}
      evaluations={evaluations}
      myEvaluation={myEvaluation}
      currentUserId={user?.id ?? null}
      ownerNickname={ownerNickname}
      currentNickname={currentNickname}
      linkedRecords={linkedRecords}
      hasMatchingRecord={hasMatchingRecord}
      resolvedCompanions={resolvedCompanions}
    />
  );
}
