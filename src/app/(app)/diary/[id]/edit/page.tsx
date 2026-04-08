import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import EditForm from "../EditForm";
import type { WineRecord } from "@/types";

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

  // 멘션된 유저 코드 조회 (편집 시 복원용)
  const { data: mentions } = await supabase
    .from("record_mentions")
    .select("mentioned_user_id, profiles:mentioned_user_id(nickname, user_code)")
    .eq("record_id", id);

  const mentionCodes: Record<string, string> = {};
  (mentions ?? []).forEach((m: unknown) => {
    const row = m as { profiles: { nickname: string; user_code: string } | { nickname: string; user_code: string }[] | null };
    const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    if (p) mentionCodes[p.nickname] = p.user_code;
  });

  const recordWithMentions = { ...record, _mentionCodes: mentionCodes };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950">
      <header className="px-5 pt-12 pb-4 flex items-center gap-3">
        <Link href={`/diary/${id}`} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/20 transition-colors text-lg">←</Link>
        <h1 className="text-xl font-bold text-white">기록 수정</h1>
      </header>
      <div className="px-4 py-6 pb-28">
        <EditForm record={recordWithMentions as WineRecord} redirectAfterSave={`/diary/${id}`} />
      </div>
    </div>
  );
}
