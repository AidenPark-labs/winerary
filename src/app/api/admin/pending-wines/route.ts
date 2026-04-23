import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { insertWineDirectly, type WineCreateInput } from "@/lib/promote-raw-wine";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase());

/**
 * 편입 대기 승인 플로우 (2026-04-24 원복):
 *
 * raw_wines는 크롤링 원본 데이터 전용. 유저 제출(pending_wines)은 raw_wines를 거치지 않고
 * wines에 직접 INSERT. 단, promote-v2와 동일한 정책 재사용:
 *   - 4필드 검증 (name_ko + name_en + country + grape)
 *   - 이름 빈티지 제거 (stripVintage)
 *   - 기존 wines와 exact match 자동 merge / name_ko UNIQUE 충돌 fallback
 *   - Vivino 매핑 (있을 때만)
 *
 * 변경 절차:
 *   1. pending_wines 한 건 읽기 (name_en 없으면 wine_records.wine_name_original 에서 보강)
 *   2. insertWineDirectly() 호출 → wines INSERT (또는 auto_merge)
 *   3. pending_wines.promoted_wine_id + wine_records.wine_id 세팅
 */
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

  // 1. pending_wines 읽기
  const { data: pending } = await admin.from("pending_wines").select("*").eq("id", id).single();
  if (!pending) return Response.json({ error: "Not found" }, { status: 404 });

  // name_en 보강
  let nameEn = pending.name_en;
  if (!nameEn) {
    const { data: rec } = await admin
      .from("wine_records")
      .select("wine_name_original")
      .eq("pending_wine_id", id)
      .not("wine_name_original", "is", null)
      .limit(1)
      .single();
    if (rec?.wine_name_original) nameEn = rec.wine_name_original;
  }

  // 2. insertWineDirectly
  const input: WineCreateInput = {
    name_ko: pending.name_ko,
    name_en: nameEn,
    country: pending.country,
    region: pending.region_path ?? pending.region ?? null,
    wine_type: pending.wine_type,
    grape_varieties: Array.isArray(pending.grape_varieties) && pending.grape_varieties.length > 0
      ? pending.grape_varieties
      : null,
    grape_variety: pending.grape_variety,
    producer_ko: pending.producer_ko,
    producer_en: pending.producer_en,
    image_url: pending.image_url,
    price: pending.price ?? null,
    data_source: "user_submission",
  };
  const outcome = await insertWineDirectly(admin, input);

  switch (outcome.kind) {
    case "missing_fields":
      return Response.json({
        error: "필수 필드 부족",
        missing: outcome.missing,
        hint: "pending_wines를 먼저 보강한 뒤 다시 승인하세요.",
      }, { status: 400 });
    case "error":
      return Response.json({ error: outcome.message }, { status: 500 });
  }

  const wineId = outcome.wine_id;

  // 3. pending_wines + wine_records 연결
  await admin.from("pending_wines").update({
    status: "promoted",
    promoted_wine_id: wineId,
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  await admin.from("wine_records").update({ wine_id: wineId }).eq("pending_wine_id", id);

  return Response.json({ ok: true, wine_id: wineId, outcome_kind: outcome.kind });
}
