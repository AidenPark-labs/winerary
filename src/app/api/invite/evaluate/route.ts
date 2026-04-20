import { createClient } from "@supabase/supabase-js";

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function POST(request: Request) {
  const body = await request.json();
  const { invite_code, guest_nickname, rating, value_score, pairing_score, memo } = body;

  if (!invite_code || !guest_nickname?.trim()) {
    return Response.json({ error: "초대 코드와 닉네임이 필요합니다" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: record } = await admin
    .from("wine_records")
    .select("id, wine_id, pending_wine_id")
    .eq("invite_code", invite_code)
    .is("deleted_at", null)
    .single();

  if (!record) {
    return Response.json({ error: "유효하지 않은 초대 코드입니다" }, { status: 404 });
  }

  const { data: existing } = await admin
    .from("evaluations")
    .select("id")
    .eq("record_id", record.id)
    .is("user_id", null)
    .eq("nickname", guest_nickname.trim())
    .eq("role", "guest")
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("evaluations")
      .update({
        rating: rating ?? null,
        value_score: value_score ?? null,
        pairing_score: pairing_score ?? null,
        memo: memo?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true, updated: true });
  }

  const { error } = await admin
    .from("evaluations")
    .insert({
      record_id: record.id,
      wine_id: record.wine_id,
      pending_wine_id: record.pending_wine_id,
      user_id: null,
      nickname: guest_nickname.trim(),
      role: "guest",
      rating: rating ?? null,
      value_score: value_score ?? null,
      pairing_score: pairing_score ?? null,
      memo: memo?.trim() || null,
    });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
