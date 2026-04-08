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

  // 초대 코드로 레코드 조회
  const { data: record } = await admin
    .from("wine_records")
    .select("id")
    .eq("invite_code", invite_code)
    .is("deleted_at", null)
    .single();

  if (!record) {
    return Response.json({ error: "유효하지 않은 초대 코드입니다" }, { status: 404 });
  }

  // 같은 닉네임으로 이미 평가했는지 확인
  const { data: existing } = await admin
    .from("record_evaluations")
    .select("id")
    .eq("record_id", record.id)
    .is("user_id", null)
    .eq("guest_nickname", guest_nickname.trim())
    .maybeSingle();

  if (existing) {
    // 수정
    const { error } = await admin
      .from("record_evaluations")
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

  // 신규
  const { error } = await admin
    .from("record_evaluations")
    .insert({
      record_id: record.id,
      user_id: null,
      guest_nickname: guest_nickname.trim(),
      rating: rating ?? null,
      value_score: value_score ?? null,
      pairing_score: pairing_score ?? null,
      memo: memo?.trim() || null,
    });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
