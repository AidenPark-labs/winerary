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

  // wines 테이블에서 description 조회 (이름 매칭)
  let wineDescription: string | null = null;
  if (record.name) {
    const { data: wine } = await supabase
      .from("wines")
      .select("description")
      .eq("name_ko", record.name)
      .maybeSingle();
    wineDescription = wine?.description ?? null;
  }

  return <DiaryDetail record={record as WineRecord} wineDescription={wineDescription} />;
}
