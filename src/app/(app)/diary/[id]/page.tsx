import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import DiaryDetail from "./DiaryDetail";
import type { WineRecord } from "@/types";

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

  // 본인 기록이 아니면 readOnly (멘션으로 공유받은 경우)
  const isOwner = user?.id === record.user_id;

  // wines 테이블에서 Vivino 데이터 조회 (wine_id 우선, 없으면 name 매칭)
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

  return <DiaryDetail record={record as WineRecord} readOnly={!isOwner} wineData={wineData} />;
}
