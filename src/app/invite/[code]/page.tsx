import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { WineRecord, RecordEvaluation } from "@/types";
import InviteDetail from "./InviteDetail";

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const admin = createAdminClient();
  const { data: record } = await admin
    .from("wine_records")
    .select("name, wine_vintage, memo, photos")
    .eq("invite_code", code)
    .is("deleted_at", null)
    .single();

  if (!record) return { title: "Winerary" };
  return {
    title: `${record.name}${record.wine_vintage ? ` ${record.wine_vintage}` : ""} — 평가 초대`,
    description: record.memo ?? `${record.name} 와인을 함께 평가해보세요`,
    openGraph: {
      images: record.photos?.[0] ? [{ url: record.photos[0] }] : [],
    },
  };
}

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const admin = createAdminClient();

  const { data: record } = await admin
    .from("wine_records")
    .select("*")
    .eq("invite_code", code)
    .is("deleted_at", null)
    .single();

  if (!record) notFound();

  // v5: wines_v2 + vivino_wines 합성
  const { fetchWineWithVivinoById } = await import("@/lib/wines-v2-fetch");
  let wineData = null;
  if (record.wine_id) {
    wineData = await fetchWineWithVivinoById(admin, record.wine_id);
  }
  if (!wineData && record.name) {
    const { data: byName } = await admin
      .from("wines")
      .select("id")
      .eq("name_ko", record.name)
      .maybeSingle();
    if (byName?.id) {
      wineData = await fetchWineWithVivinoById(admin, byName.id);
    }
  }

  // 기존 평가 조회 (v3: evaluations role='guest')
  const { data: evals } = await admin
    .from("evaluations")
    .select("*, profiles:user_id(nickname)")
    .eq("record_id", record.id)
    .eq("role", "guest");

  const evaluations: RecordEvaluation[] = (evals ?? []).map((e: unknown) => {
    const row = e as Record<string, unknown>;
    const profile = row.profiles as { nickname: string } | null;
    return {
      id: row.id as string,
      record_id: row.record_id as string,
      user_id: row.user_id as string,
      rating: row.rating as number | null,
      value_score: row.value_score as number | null,
      pairing_score: row.pairing_score as number | null,
      memo: row.memo as string | null,
      repurchase_intent: (row.repurchase_intent as string | null) ?? null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      nickname: profile?.nickname ?? (row.guest_nickname as string) ?? undefined,
    };
  });

  const hasFoods = ((record.foods as { name: string }[]) ?? []).length > 0;

  return (
    <InviteDetail
      record={record as WineRecord}
      wineData={wineData}
      evaluations={evaluations}
      inviteCode={code}
      hasFoods={hasFoods}
    />
  );
}
