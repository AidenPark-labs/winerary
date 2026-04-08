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
    .select("id, name, wine_id, drunk_at, user_id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!sharedRecord) notFound();
  if (sharedRecord.user_id === user.id) redirect(`/diary/${id}/link`);

  // 내 같은 날짜 기록 조회
  const { data: myRecords } = await supabase
    .from("wine_records")
    .select("id, name, wine_id, photos, drunk_at")
    .eq("user_id", user.id)
    .eq("drunk_at", sharedRecord.drunk_at)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  // 와인명 유사도 계산 (공통 글자 비율)
  function nameSimilarity(a: string, b: string): number {
    const la = a.toLowerCase().replace(/\s/g, "");
    const lb = b.toLowerCase().replace(/\s/g, "");
    if (la === lb) return 1;
    if (la.includes(lb) || lb.includes(la)) return 0.8;
    const shorter = la.length < lb.length ? la : lb;
    const longer = la.length < lb.length ? lb : la;
    let matches = 0;
    for (const ch of shorter) { if (longer.includes(ch)) matches++; }
    return matches / longer.length;
  }

  const sharedName = sharedRecord.name ?? "";
  const myRecordList = (myRecords ?? [])
    .map((r: Record<string, unknown>) => {
      const name = r.name as string;
      const wineIdMatch = sharedRecord.wine_id && r.wine_id && sharedRecord.wine_id === r.wine_id;
      const similarity = wineIdMatch ? 1 : nameSimilarity(sharedName, name);
      return {
        id: r.id as string,
        name,
        photos: (r.photos as string[]) ?? [],
        drunk_at: r.drunk_at as string,
        similarity,
        recommended: similarity >= 0.4 || !!wineIdMatch,
      };
    })
    .sort((a, b) => b.similarity - a.similarity);

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950">
      <header className="px-5 pt-12 pb-4 flex items-center gap-3">
        <Link href={`/diary/${id}`} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/20 transition-colors text-lg">←</Link>
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
