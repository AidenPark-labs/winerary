import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import EditForm from "../EditForm";
import type { WineRecord, CompanionEntry } from "@/types";

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: record } = await supabase
    .from("wine_records")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!record) notFound();

  // 멘션된 유저 정보 조회 → CompanionEntry[] 직접 구성
  const { data: mentions } = await supabase
    .from("record_mentions")
    .select("mentioned_user_id, profiles:mentioned_user_id(nickname, user_code)")
    .eq("record_id", id);

  // record_mentions를 소스 오브 트루스로: 멘션된 유저는 현재 닉네임 + userCode로 복원
  const mentionEntries: CompanionEntry[] = [];
  const mentionNicknames = new Set<string>();
  (mentions ?? []).forEach((m: unknown) => {
    const row = m as { profiles: { nickname: string; user_code: string } | { nickname: string; user_code: string }[] | null };
    const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    if (p) {
      mentionEntries.push({ name: p.nickname, userCode: p.user_code });
      mentionNicknames.add(p.nickname);
    }
  });

  // 일반 텍스트 동행자 (멘션이 아닌 것)만 companions에서 가져옴
  const plainEntries: CompanionEntry[] = (record.companions ?? [])
    .filter((c: string) => !c.startsWith("@"))
    .map((c: string) => ({ name: c, userCode: null }));

  const companionEntries: CompanionEntry[] = [...mentionEntries, ...plainEntries];

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950">
      <header className="px-5 pt-8 pb-2 flex items-center gap-3">
        <Link href={`/diary/${id}`} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/20 transition-colors text-lg">←</Link>
        <h1 className="text-xl font-bold text-white">기록 수정</h1>
      </header>
      <div className="px-4 py-6 pb-28">
        <EditForm record={record as WineRecord} initialCompanionEntries={companionEntries} redirectAfterSave={`/diary/${id}`} />
      </div>
    </div>
  );
}
