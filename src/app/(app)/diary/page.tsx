import { createClient } from "@/lib/supabase/server";
import type { WineRecord } from "@/types";
import DiaryClient from "./DiaryClient";
import AuthPrompt from "@/components/AuthPrompt";

export default async function DiaryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <>
        <DiaryClient records={[]} />
        <AuthPrompt message="와인을 기록하고 나만의 노트를 관리해보세요" />
      </>
    );
  }

  const { data: records } = await supabase
    .from("wine_records")
    .select("*")
    .is("deleted_at", null)
    .order("drunk_at", { ascending: false })
    .order("created_at", { ascending: false });

  return <DiaryClient records={(records ?? []) as WineRecord[]} />;
}
