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
  const { data: mentions } = await supabase
    .from("record_mentions")
    .select("record_id, wine_records(*), profiles:wine_records(user_id, profiles:user_id(nickname))")
    .eq("mentioned_user_id", user.id);

  const sharedRecords = (mentions ?? [])
    .filter((m) => m.wine_records && !(m.wine_records as unknown as WineRecord).deleted_at)
    .map((m) => ({
      ...(m.wine_records as unknown as WineRecord),
      _shared: true,
      _ownerNickname: ((m as unknown as Record<string, unknown>).profiles as { profiles: { nickname: string } } | null)?.profiles?.nickname ?? null,
    }));

  // 합쳐서 날짜순 정렬 (중복 제거)
  const ownIds = new Set((ownRecords ?? []).map((r) => r.id));
  const allRecords = [
    ...(ownRecords ?? []),
    ...sharedRecords.filter((r) => !ownIds.has(r.id)),
  ].sort((a, b) => new Date(b.drunk_at).getTime() - new Date(a.drunk_at).getTime());

  return <DiaryClient records={allRecords as WineRecord[]} />;
}
