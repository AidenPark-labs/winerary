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

  // 같은 날짜의 다른 유저 기록 조회
  const { data: candidates } = await supabase
    .from("wine_records")
    .select("id, name, photos, drunk_at, user_id")
    .eq("drunk_at", record.drunk_at)
    .neq("user_id", user.id)
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
      <header className="px-5 pt-12 pb-4 flex items-center gap-3 border-b border-zinc-800">
        <Link href={`/diary/${id}`} className="text-zinc-400 hover:text-zinc-200 text-2xl">←</Link>
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
