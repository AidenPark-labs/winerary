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
    .select("id, name, wine_name_original, photos, foods, user_id, rating, value_score, pairing_score, memo, repurchase_intent")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!record) notFound();

  const isOwner = record.user_id === user.id;
  const hasFoods = Array.isArray(record.foods) && record.foods.length > 0;

  if (isOwner) {
    // 본인 기록: record 자체의 평가 데이터 사용
    const hasExisting = record.rating != null || record.value_score != null;
    return (
      <div className="flex flex-col min-h-screen bg-zinc-950">
        <header className="px-5 pt-12 pb-4 flex items-center gap-3">
          <Link href={`/diary/${id}`} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/20 transition-colors text-lg">←</Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-white">평가 {hasExisting ? "수정" : "작성"}</h1>
            <p className="text-xs text-zinc-500 truncate">{record.name}</p>
          </div>
        </header>
        <div className="px-4 py-6 pb-28">
          <EvaluateForm
            recordId={id}
            mode="owner"
            hasFoods={hasFoods}
            existing={hasExisting ? {
              rating: record.rating,
              value_score: record.value_score,
              pairing_score: record.pairing_score,
              memo: record.memo,
              repurchase_intent: record.repurchase_intent,
            } : null}
          />
        </div>
      </div>
    );
  }

  // 공유받은 유저: record_evaluations 테이블 사용
  const { data: existing } = await supabase
    .from("record_evaluations")
    .select("*")
    .eq("record_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950">
      <header className="px-5 pt-12 pb-4 flex items-center gap-3">
        <Link href={`/diary/${id}`} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/20 transition-colors text-lg">←</Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white">평가 {existing ? "수정" : "작성"}</h1>
          <p className="text-xs text-zinc-500 truncate">{record.name}</p>
        </div>
      </header>
      <div className="px-4 py-6 pb-28">
        <EvaluateForm
          recordId={id}
          mode="guest"
          hasFoods={hasFoods}
          existing={existing ? {
            rating: existing.rating,
            value_score: existing.value_score,
            pairing_score: existing.pairing_score,
            memo: existing.memo,
            repurchase_intent: existing.repurchase_intent,
          } : null}
        />
      </div>
    </div>
  );
}
