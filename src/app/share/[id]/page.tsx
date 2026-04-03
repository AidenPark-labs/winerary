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
      {/* 하단 CTA */}
      <div className="fixed bottom-0 inset-x-0 z-50 px-4 pb-8 pt-6 bg-gradient-to-t from-black via-black/90 to-transparent">
        <a
          href="/login"
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-rose-700 hover:bg-rose-600 active:scale-95 transition-all text-white font-semibold text-sm shadow-lg shadow-rose-900/40"
        >
          🍷 나도 와인 기록해보기
        </a>
        <p className="text-center text-[11px] text-zinc-600 mt-2 tracking-widest">powered by winerary</p>
      </div>
    </>
  );
}
