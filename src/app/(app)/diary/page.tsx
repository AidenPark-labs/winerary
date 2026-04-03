import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { WineRecord } from "@/types";
import DiaryClient from "./DiaryClient";

export default async function DiaryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: records } = await supabase
    .from("wine_records")
    .select("*")
    .is("deleted_at", null)
    .order("drunk_at", { ascending: false })
    .order("created_at", { ascending: false });

  return <DiaryClient records={(records ?? []) as WineRecord[]} />;
}
