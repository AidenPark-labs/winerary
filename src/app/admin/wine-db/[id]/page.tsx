import { requireAdmin } from "@/lib/admin";
import Link from "next/link";

export default async function WineDbDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();

  const { data: wine } = await supabase
    .from("wines_with_vivino")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!wine) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <h1 className="text-xl font-semibold mb-2">와인을 찾을 수 없습니다</h1>
        <p className="text-zinc-500 text-sm font-mono mb-6">{id}</p>
        <Link href="/admin/wine-db" className="text-rose-400 hover:underline">← 목록으로</Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <Link href="/admin/wine-db" className="text-sm text-zinc-500 hover:text-zinc-300">← 목록으로</Link>
      <h1 className="text-2xl font-bold mt-3">{wine.name_ko}</h1>
      {wine.name_en && <p className="text-sm text-zinc-500 italic">{wine.name_en}</p>}
      <p className="text-[10px] text-zinc-600 font-mono mt-1 select-all">{wine.id}</p>

      <div className="mt-8 p-6 rounded-2xl bg-amber-500/5 border border-amber-500/20">
        <p className="text-sm text-amber-200">
          단일 와인 페이지는 다음 세션에 구현됩니다 — 6섹션(편집 / Vivino / 변환 검수 / 중복 후보 / Vivino URL 그룹 / 신고).
          현재는 stub.
        </p>
      </div>
    </div>
  );
}
