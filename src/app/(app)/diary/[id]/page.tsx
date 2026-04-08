import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import DiaryDetail from "./DiaryDetail";
import type { WineRecord, RecordEvaluation } from "@/types";

export default async function DiaryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: record } = await supabase
    .from("wine_records")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!record) notFound();

  const isOwner = user?.id === record.user_id;

  // wines 테이블에서 Vivino 데이터 조회
  const wineFields = "id, description, vivino_url, vivino_rating, vivino_reviews, vivino_winery, vivino_grapes, vivino_region, vivino_style, vivino_alcohol, vivino_description, grape_variety, region, country, producer, wine_type, final_grapes, final_region, final_country, final_producer, final_wine_type, final_alcohol, final_style, final_description";
  let wineData = null;

  if (record.wine_id) {
    const { data } = await supabase.from("wines").select(wineFields).eq("id", record.wine_id).maybeSingle();
    wineData = data;
  }
  if (!wineData && record.name) {
    const { data } = await supabase.from("wines").select(wineFields).eq("name_ko", record.name).maybeSingle();
    wineData = data;
  }

  // 평가 데이터 조회
  let evaluations: RecordEvaluation[] = [];
  let myEvaluation: RecordEvaluation | null = null;
  try {
    const { data: evals } = await supabase
      .from("record_evaluations")
      .select("*, profiles:user_id(nickname)")
      .eq("record_id", id);

    evaluations = (evals ?? []).map((e: unknown) => {
      const row = e as Record<string, unknown>;
      const profile = row.profiles as { nickname: string } | null;
      return {
        id: row.id as string,
        record_id: row.record_id as string,
        user_id: row.user_id as string,
        rating: row.rating as number | null,
        value_score: row.value_score as number | null,
        memo: row.memo as string | null,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
        nickname: profile?.nickname ?? undefined,
      };
    });

    if (user) {
      myEvaluation = evaluations.find((e) => e.user_id === user.id) ?? null;
    }
  } catch {
    // 평가 테이블 조회 실패 시 무시
  }

  return (
    <DiaryDetail
      record={record as WineRecord}
      readOnly={!isOwner}
      wineData={wineData}
      evaluations={evaluations}
      myEvaluation={myEvaluation}
      currentUserId={user?.id ?? null}
    />
  );
}
