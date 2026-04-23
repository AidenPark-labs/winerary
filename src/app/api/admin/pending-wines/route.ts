import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { promoteSingleRawWine, type RawWineInput } from "@/lib/promote-raw-wine";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase());

/**
 * 편입 대기 승인 플로우 (2026-04-24 재설계):
 *   1. pending_wines 에서 한 건 읽기 (name_en 없으면 wine_records.wine_name_original 에서 보강)
 *   2. raw_wines(source='user_submission', source_id=pending.id)에 upsert
 *      → 불변식 "모든 wines는 raw_wines에 대응" 유지
 *   3. promoteSingleRawWine() 호출 — 4필드 검증 + dedupe + 자동 merge or 신규 INSERT
 *   4. pending_wines.promoted_wine_id + wine_records.wine_id 세팅
 *
 * 결과에 따라 다음 outcome:
 *   - new_promoted / auto_merged / already_promoted: wine_id 확정 → pending promoted
 *   - candidate: 검수 큐 등록됨 → pending은 그대로 유지하지 않고 promoted 처리하되
 *                promoted_wine_id는 후보로 제시된 target_wine_id 로
 *   - missing_fields: pending 그대로 (어드민이 필드 보강 필요)
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

  // 2. raw_wines upsert (source='user_submission', source_id=pending.id)
  //    이미 있으면 기존 raw row 사용
  const { data: existingRaw } = await admin
    .from("raw_wines")
    .select("id, source, name_ko, name_en, country, region, wine_type, grape_variety, producer_ko, producer_en, image_url, price, raw_payload, promoted_wine_id")
    .eq("source", "user_submission")
    .eq("source_id", pending.id)
    .maybeSingle();

  let rawRow = existingRaw;
  if (!rawRow) {
    const grapeVariety = Array.isArray(pending.grape_varieties) && pending.grape_varieties.length > 0
      ? (pending.grape_varieties as string[]).join(", ")
      : (pending.grape_variety ?? null);
    const payload = {
      source: "user_submission",
      source_id: pending.id,
      name_ko: pending.name_ko,
      name_en: nameEn,
      wine_type: pending.wine_type,
      country: pending.country,
      region: pending.region_path ?? null,
      grape_variety: grapeVariety,
      producer: pending.producer_ko ?? pending.producer_en ?? pending.producer,
      producer_ko: pending.producer_ko,
      producer_en: pending.producer_en,
      image_url: pending.image_url,
      alcohol: pending.alcohol,
      raw_payload: {
        from_pending_wine_id: pending.id,
        submitted_by: pending.submitted_by,
        rejected_reason: pending.rejected_reason ?? null,
        created_via: "admin_promote_pending",
        created_at: new Date().toISOString(),
      },
    };
    const { data: inserted, error: insErr } = await admin
      .from("raw_wines")
      .insert(payload)
      .select("id, source, name_ko, name_en, country, region, wine_type, grape_variety, producer_ko, producer_en, image_url, price, raw_payload, promoted_wine_id")
      .single();
    if (insErr || !inserted) {
      return Response.json({ error: `raw_wines 삽입 실패: ${insErr?.message ?? "unknown"}` }, { status: 500 });
    }
    rawRow = inserted;
  }

  // 3. promoteSingleRawWine 호출
  const outcome = await promoteSingleRawWine(admin, rawRow as RawWineInput);

  // 4. 결과에 따라 pending 처리
  let wineId: string | null = null;
  let newStatus = "pending";

  switch (outcome.kind) {
    case "already_promoted":
    case "auto_merged":
    case "new_promoted":
      wineId = outcome.wine_id;
      newStatus = "promoted";
      break;
    case "candidate":
      // 검수 큐로 가지만, 어드민이 명시적으로 승인했으니 target에 붙이는 걸 승격으로 간주
      wineId = outcome.wine_id;
      newStatus = "promoted";
      break;
    case "missing_fields":
      return Response.json({
        error: "필수 필드 부족",
        missing: outcome.missing,
        hint: "pending_wines를 먼저 보강하거나, /admin/raw-wines 에서 raw 레코드를 편집 후 승격하세요.",
      }, { status: 400 });
    case "error":
      return Response.json({ error: outcome.message }, { status: 500 });
  }

  // pending 상태 업데이트
  if (wineId) {
    await admin.from("pending_wines").update({
      status: newStatus,
      promoted_wine_id: wineId,
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    // wine_records 연결
    await admin.from("wine_records").update({ wine_id: wineId }).eq("pending_wine_id", id);
  }

  return Response.json({
    ok: true,
    wine_id: wineId,
    outcome_kind: outcome.kind,
    via_raw_wine_id: rawRow.id,
  });
}
