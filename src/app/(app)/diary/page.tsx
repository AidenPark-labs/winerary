import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { WineRecord } from "@/types";
import DiaryClient from "./DiaryClient";
import AuthPrompt from "@/components/AuthPrompt";

export default async function DiaryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <>
        <DiaryClient records={[]} />
        <AuthPrompt message="와인을 기록하고 나만의 노트를 관리해보세요" />
      </>
    );
  }

  // 내 기록
  const { data: ownRecords } = await supabase
    .from("wine_records")
    .select("*")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("drunk_at", { ascending: false })
    .order("created_at", { ascending: false });

  // 멘션되어 공유받은 기록
  let sharedRecords: (WineRecord & { _shared: boolean; _ownerNickname: string | null })[] = [];
  try {
    const { data: mentions } = await supabase
      .from("record_mentions")
      .select("record_id")
      .eq("mentioned_user_id", user.id);

    if (mentions && mentions.length > 0) {
      const recordIds = mentions.map((m) => m.record_id);
      const { data: shared } = await supabase
        .from("wine_records")
        .select("*, profiles:user_id(nickname)")
        .in("id", recordIds)
        .is("deleted_at", null);

      sharedRecords = (shared ?? []).map((r) => {
        const profile = (r as unknown as Record<string, unknown>).profiles as { nickname: string } | null;
        const { profiles: _, ...record } = r as unknown as Record<string, unknown>;
        return {
          ...record,
          _shared: true,
          _ownerNickname: profile?.nickname ?? null,
        } as WineRecord & { _shared: boolean; _ownerNickname: string | null };
      });
    }
  } catch {
    // record_mentions 조회 실패 시 공유 기록 없이 진행
  }

  // 합쳐서 날짜순 정렬 (중복 제거)
  const ownIds = new Set((ownRecords ?? []).map((r) => r.id));
  const allRecords = [
    ...(ownRecords ?? []),
    ...sharedRecords.filter((r) => !ownIds.has(r.id)),
  ].sort((a, b) => new Date(b.drunk_at).getTime() - new Date(a.drunk_at).getTime());

  // 연결된 경험 정보 조회
  const adminDb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  type LinkedInfo = { record_id: string; linked_record_id: string; linked_name: string; linked_photos: string[]; linked_rating: number | null; linked_nickname: string };
  let linkedMap: Record<string, LinkedInfo[]> = {};
  try {
    const allIds = allRecords.map((r) => r.id);
    const { data: links } = await adminDb
      .from("shared_experience_records")
      .select("experience_id, record_id")
      .in("record_id", allIds);

    if (links && links.length > 0) {
      // experience_id → record_ids 맵
      const expMap: Record<string, string[]> = {};
      links.forEach((l: { experience_id: string; record_id: string }) => {
        (expMap[l.experience_id] ??= []).push(l.record_id);
      });

      // 각 experience에서 연결된 다른 기록 조회
      const expIds = Object.keys(expMap);
      const { data: allExpLinks } = await adminDb
        .from("shared_experience_records")
        .select("experience_id, record_id")
        .in("experience_id", expIds);

      // 내 소유 기록이 아닌 연결 기록 ID 수집
      const otherRecordIds = new Set<string>();
      (allExpLinks ?? []).forEach((l: { record_id: string }) => {
        if (!ownIds.has(l.record_id)) otherRecordIds.add(l.record_id);
      });

      if (otherRecordIds.size > 0) {
        const { data: otherRecords } = await adminDb
          .from("wine_records")
          .select("id, name, photos, rating, user_id")
          .in("id", [...otherRecordIds])
          .is("deleted_at", null);

        const otherUserIds = [...new Set((otherRecords ?? []).map((r: { user_id: string }) => r.user_id))];
        const { data: profiles } = otherUserIds.length > 0
          ? await adminDb.from("profiles").select("id, nickname").in("id", otherUserIds)
          : { data: [] };
        const nickMap: Record<string, string> = {};
        (profiles ?? []).forEach((p: { id: string; nickname: string }) => { nickMap[p.id] = p.nickname; });

        const otherMap: Record<string, { name: string; photos: string[]; rating: number | null; nickname: string }> = {};
        (otherRecords ?? []).forEach((r: { id: string; name: string; photos: string[]; rating: number | null; user_id: string }) => {
          otherMap[r.id] = { name: r.name, photos: r.photos ?? [], rating: r.rating, nickname: nickMap[r.user_id] ?? "알 수 없음" };
        });

        // 내 기록 → 연결 기록 매핑
        (allExpLinks ?? []).forEach((l: { experience_id: string; record_id: string }) => {
          const myRecordsInExp = expMap[l.experience_id] ?? [];
          if (ownIds.has(l.record_id)) return; // 내 소유 기록은 스킵
          const other = otherMap[l.record_id];
          if (!other) return;
          myRecordsInExp.forEach((myId) => {
            (linkedMap[myId] ??= []).push({
              record_id: myId,
              linked_record_id: l.record_id,
              linked_name: other.name,
              linked_photos: other.photos,
              linked_rating: other.rating,
              linked_nickname: other.nickname,
            });
          });
        });
      }
    }
  } catch {
    // 연결 조회 실패 시 무시
  }

  // 연결된 기록은 피드에서 제거 (내 카드에 통합 표시)
  const linkedOtherIds = new Set(Object.values(linkedMap).flat().map((l) => l.linked_record_id));
  const filteredRecords = allRecords.filter((r) => !linkedOtherIds.has(r.id));

  return <DiaryClient records={filteredRecords as WineRecord[]} linkedMap={linkedMap} />;
}
