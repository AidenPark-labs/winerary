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

  // wines 데이터 조회
  const wineFields = "id, description, vivino_url, vivino_rating, vivino_reviews, vivino_winery, vivino_grapes, vivino_region, vivino_style, vivino_alcohol, vivino_description, grape_variety, region, country, producer, wine_type, final_grapes, final_region, final_country, final_producer, final_wine_type, final_alcohol, final_style, final_description";
  let wineData = null;
  if (record.wine_id) {
    const { data } = await admin.from("wines").select(wineFields).eq("id", record.wine_id).maybeSingle();
    wineData = data;
  }
  if (!wineData && record.name) {
    const { data } = await admin.from("wines").select(wineFields).eq("name_ko", record.name).maybeSingle();
    wineData = data;
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
