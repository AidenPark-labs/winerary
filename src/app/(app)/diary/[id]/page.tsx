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

  return <DiaryDetail record={record as WineRecord} />;
}
