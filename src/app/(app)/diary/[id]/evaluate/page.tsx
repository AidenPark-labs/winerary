import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import EvaluateForm from "./EvaluateForm";

export default async function EvaluatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: record } = await supabase
    .from("wine_records")
    .select("id, name, wine_name_original, photos, foods")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!record) notFound();

  // 기존 평가 조회
  const { data: existing } = await supabase
    .from("record_evaluations")
    .select("*")
    .eq("record_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const hasFoods = Array.isArray(record.foods) && record.foods.length > 0;

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950">
      <header className="px-5 pt-12 pb-4 flex items-center gap-3 border-b border-zinc-800">
        <Link href={`/diary/${id}`} className="text-zinc-400 hover:text-zinc-200 text-2xl">←</Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white">평가 {existing ? "수정" : "작성"}</h1>
          <p className="text-xs text-zinc-500 truncate">{record.name}</p>
        </div>
      </header>
      <div className="px-4 py-6 pb-28">
        <EvaluateForm
          recordId={id}
          hasFoods={hasFoods}
          existing={existing ? {
            rating: existing.rating,
            value_score: existing.value_score,
            pairing_score: existing.pairing_score,
            memo: existing.memo,
          } : null}
        />
      </div>
    </div>
  );
}
