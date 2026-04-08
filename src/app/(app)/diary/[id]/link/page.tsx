import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import LinkForm from "./LinkForm";

export default async function LinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: record } = await supabase
    .from("wine_records")
    .select("id, name, drunk_at, user_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single();

  if (!record) notFound();

  // 1) 내 기록에서 멘션한 유저 ID 조회
  const { data: myMentions } = await supabase
    .from("record_mentions")
    .select("mentioned_user_id")
    .eq("record_id", id);
  const mentionedUserIds = (myMentions ?? []).map((m: { mentioned_user_id: string }) => m.mentioned_user_id);

  // 2) 나를 멘션한 기록의 작성자 ID 조회 (같은 날짜)
  const { data: mentionedByRecords } = await supabase
    .from("record_mentions")
    .select("record_id, wine_records!inner(user_id, drunk_at, deleted_at)")
    .eq("mentioned_user_id", user.id);

  const mentionedByUserIds = (mentionedByRecords ?? [])
    .filter((m: Record<string, unknown>) => {
      const wr = m.wine_records as { user_id: string; drunk_at: string; deleted_at: string | null } | null;
      return wr && wr.drunk_at === record.drunk_at && wr.deleted_at === null;
    })
    .map((m: Record<string, unknown>) => {
      const wr = m.wine_records as { user_id: string };
      return wr.user_id;
    });

  // 상대방이 나를 멘션한 경우만 연결 가능 (상대가 나를 인정한 경우)
  const companionUserIds = [...new Set(mentionedByUserIds)];

  if (companionUserIds.length === 0) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-950">
        <header className="px-5 pt-8 pb-2 flex items-center gap-3">
          <Link href={`/diary/${id}`} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/20 transition-colors text-lg">←</Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-white">경험 연결</h1>
            <p className="text-xs text-zinc-500 truncate">{record.name} · {record.drunk_at}</p>
          </div>
        </header>
        <div className="flex flex-col items-center justify-center flex-1 px-8 text-center gap-4">
          <p className="text-zinc-500 text-sm font-light leading-relaxed">상대방이 나를 동행자(@멘션)로 등록한 경우에만 연결할 수 있습니다.</p>
          <Link href={`/diary/${id}`} className="text-sm text-violet-400 hover:text-violet-300">돌아가기</Link>
        </div>
      </div>
    );
  }

  // 동행자 관계 유저들의 같은 날짜 기록만 조회
  const { data: candidates } = await supabase
    .from("wine_records")
    .select("id, name, photos, drunk_at, user_id")
    .eq("drunk_at", record.drunk_at)
    .in("user_id", companionUserIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  // 프로필 조회
  const userIds = [...new Set((candidates ?? []).map((c: { user_id: string }) => c.user_id))];
  const { data: profiles } = userIds.length > 0
    ? await supabase.from("profiles").select("id, nickname").in("id", userIds)
    : { data: [] };

  const profileMap: Record<string, string> = {};
  (profiles ?? []).forEach((p: { id: string; nickname: string }) => { profileMap[p.id] = p.nickname; });

  // 이미 연결된 기록 ID 조회
  const { data: myLink } = await supabase
    .from("shared_experience_records")
    .select("experience_id")
    .eq("record_id", id)
    .maybeSingle();

  let linkedIds: string[] = [];
  if (myLink) {
    const { data: siblings } = await supabase
      .from("shared_experience_records")
      .select("record_id")
      .eq("experience_id", myLink.experience_id)
      .neq("record_id", id);
    linkedIds = (siblings ?? []).map((s: { record_id: string }) => s.record_id);
  }

  const candidateList = (candidates ?? []).map((c: Record<string, unknown>) => ({
    id: c.id as string,
    name: c.name as string,
    photos: (c.photos as string[]) ?? [],
    drunk_at: c.drunk_at as string,
    owner_nickname: profileMap[c.user_id as string] ?? "알 수 없음",
    isLinked: linkedIds.includes(c.id as string),
  }));

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950">
      <header className="px-5 pt-8 pb-2 flex items-center gap-3">
        <Link href={`/diary/${id}`} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/20 transition-colors text-lg">←</Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white">경험 연결</h1>
          <p className="text-xs text-zinc-500 truncate">{record.name} · {record.drunk_at}</p>
        </div>
      </header>
      <div className="px-4 py-6 pb-28">
        <LinkForm recordId={id} candidates={candidateList} />
      </div>
    </div>
  );
}
