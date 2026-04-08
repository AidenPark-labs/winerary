import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import LinkMineForm from "./LinkMineForm";

export default async function LinkMinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // 공유받은 기록 조회
  const { data: sharedRecord } = await supabase
    .from("wine_records")
    .select("id, name, drunk_at, user_id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!sharedRecord) notFound();
  // 본인 기록이면 link 페이지로
  if (sharedRecord.user_id === user.id) redirect(`/diary/${id}/link`);

  // 내 같은 날짜 기록 조회
  const { data: myRecords } = await supabase
    .from("wine_records")
    .select("id, name, photos, drunk_at")
    .eq("user_id", user.id)
    .eq("drunk_at", sharedRecord.drunk_at)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const myRecordList = (myRecords ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
    photos: (r.photos as string[]) ?? [],
    drunk_at: r.drunk_at as string,
  }));

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950">
      <header className="px-5 pt-12 pb-4 flex items-center gap-3 border-b border-zinc-800">
        <Link href={`/diary/${id}`} className="text-zinc-400 hover:text-zinc-200 text-2xl">←</Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white">내 기록 연결</h1>
          <p className="text-xs text-zinc-500 truncate">{sharedRecord.name} · {sharedRecord.drunk_at}</p>
        </div>
      </header>
      <div className="px-4 py-6 pb-28">
        <LinkMineForm sharedRecordId={id} myRecords={myRecordList} />
      </div>
    </div>
  );
}
