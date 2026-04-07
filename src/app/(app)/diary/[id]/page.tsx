import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import DiaryDetail from "./DiaryDetail";
import type { WineRecord } from "@/types";

export default async function DiaryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: record } = await supabase
    .from("wine_records")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!record) notFound();

  // wines 테이블에서 Vivino 데이터 + description 조회
  let wineData: {
    description?: string | null;
    vivino_url?: string | null;
    vivino_rating?: number | null;
    vivino_reviews?: number | null;
    vivino_winery?: string | null;
    vivino_grapes?: string | null;
    vivino_region?: string | null;
    vivino_style?: string | null;
    vivino_alcohol?: string | null;
    vivino_description?: string | null;
  } | null = null;

  if (record.name) {
    const { data: wine } = await supabase
      .from("wines")
      .select("description, vivino_url, vivino_rating, vivino_reviews, vivino_winery, vivino_grapes, vivino_region, vivino_style, vivino_alcohol, vivino_description")
      .eq("name_ko", record.name)
      .maybeSingle();
    wineData = wine ?? null;
  }

  return <DiaryDetail record={record as WineRecord} wineData={wineData} />;
}
