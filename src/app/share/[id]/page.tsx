import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { WineRecord } from "@/types";
import DiaryDetail from "@/app/(app)/diary/[id]/DiaryDetail";

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function getRecord(id: string): Promise<WineRecord | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("wine_records")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  return data ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const record = await getRecord(id);
  if (!record || record.visibility === "private") return { title: "Winerary" };

  return {
    title: `${record.name}${record.wine_vintage ? ` ${record.wine_vintage}` : ""} — Winerary`,
    description: record.memo ?? `${record.name} 와인 기록`,
    openGraph: {
      images: record.photos?.[0] ? [{ url: record.photos[0] }] : [],
    },
  };
}

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await getRecord(id);

  if (!record || record.visibility === "private") notFound();

  return (
    <>
      <DiaryDetail record={record} readOnly />
      {/* 하단 Winerary 워터마크 */}
      <div className="fixed bottom-0 inset-x-0 z-50 pb-safe flex justify-center py-3 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
        <p className="text-xs text-zinc-600 tracking-widest">powered by winerary</p>
      </div>
    </>
  );
}
