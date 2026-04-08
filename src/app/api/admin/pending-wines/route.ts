import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase());

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_EMAILS.includes(user.email?.toLowerCase() ?? "")) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id, action } = await request.json();
  if (!id || !["promote", "reject"].includes(action)) {
    return Response.json({ error: "Missing or invalid params" }, { status: 400 });
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  if (action === "reject") {
    await admin.from("pending_wines").update({ status: "rejected", updated_at: new Date().toISOString() }).eq("id", id);
    return Response.json({ ok: true });
  }

  // promote: pending_wine → wines 테이블로 편입
  const { data: pending } = await admin.from("pending_wines").select("*").eq("id", id).single();
  if (!pending) return Response.json({ error: "Not found" }, { status: 404 });

  // pending_wines에 name_en이 없으면 wine_records에서 가져오기
  if (!pending.name_en) {
    const { data: rec } = await admin
      .from("wine_records")
      .select("wine_name_original")
      .eq("pending_wine_id", id)
      .not("wine_name_original", "is", null)
      .limit(1)
      .single();
    if (rec?.wine_name_original) {
      pending.name_en = rec.wine_name_original;
    }
  }

  // wines에 이미 같은 이름이 있는지 확인
  const { data: existingWine } = await admin
    .from("wines")
    .select("id")
    .eq("name_ko", pending.name_ko)
    .limit(1)
    .single();

  let wineId: string;

  if (existingWine) {
    // 이미 존재하면 기존 wine_id 사용
    wineId = existingWine.id;
  } else {
    // wines 테이블에 INSERT
    const { data: newWine, error } = await admin
      .from("wines")
      .insert({
        name_ko: pending.name_ko,
        name_en: pending.name_en,
        wine_type: pending.wine_type,
        country: pending.country,
        grape_variety: pending.grape_variety,
        producer: pending.producer,
        data_source: "user_submission",
      })
      .select("id")
      .single();

    if (error || !newWine) {
      return Response.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
    }
    wineId = newWine.id;
  }

  // pending_wines 상태 업데이트
  await admin.from("pending_wines").update({
    status: "promoted",
    promoted_wine_id: wineId,
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  // 해당 pending_wine_id를 가진 wine_records에 wine_id 연결
  await admin.from("wine_records").update({ wine_id: wineId }).eq("pending_wine_id", id);

  return Response.json({ ok: true, wine_id: wineId });
}
