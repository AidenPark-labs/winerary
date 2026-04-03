import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import EditForm from "../EditForm";
import type { WineRecord } from "@/types";

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: record } = await supabase
    .from("wine_records")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!record) notFound();

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950">
      <header className="px-5 pt-12 pb-4 flex items-center gap-3 border-b border-zinc-800">
        <Link href={`/diary/${id}`} className="text-zinc-400 hover:text-zinc-200 text-2xl">←</Link>
        <h1 className="text-xl font-bold">기록 수정</h1>
      </header>
      <div className="px-4 py-6 pb-28">
        <EditForm record={record as WineRecord} redirectAfterSave={`/diary/${id}`} />
      </div>
    </div>
  );
}
