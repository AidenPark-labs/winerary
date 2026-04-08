import { createClient } from "@/lib/supabase/server";
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

  return <DiaryClient records={allRecords as WineRecord[]} />;
}
