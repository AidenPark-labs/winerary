import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase());

export async function POST(request: Request) {
  // 어드민 인증 확인
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_EMAILS.includes(user.email?.toLowerCase() ?? "")) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { recordId, action, wineId, wineData } = await request.json();
  if (!recordId || !action) {
    return Response.json({ error: "Missing params" }, { status: 400 });
  }

  // service role로 RLS 무시
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  if (action === "delete") {
    await admin.from("wine_records").update({ deleted_at: new Date().toISOString() }).eq("id", recordId);
  } else if (action === "restore") {
    await admin.from("wine_records").update({ deleted_at: null }).eq("id", recordId);
  } else if (action === "hard_delete") {
    await admin.from("wine_records").delete().eq("id", recordId);
  } else if (action === "update_wine_id") {
    await admin.from("wine_records").update({ wine_id: wineId ?? null }).eq("id", recordId);
  } else if (action === "create_wine") {
    // v5: 변환 모듈 통과 후 wines_v2 INSERT
    const { transformInput } = await import("@/lib/wines-v2-transform");
    const grapes = wineData.grape_variety
      ? String(wineData.grape_variety).split(/[,;/]/).map((s: string) => s.trim()).filter(Boolean)
      : [];
    const result = await transformInput(admin, {
      source: "admin",
      name_ko: wineData.name_ko,
      name_en: wineData.name_en,
      country: wineData.country,
      wine_type: wineData.wine_type,
      grape_varieties: grapes,
    });
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    const { randomUUID } = await import("crypto");
    const newId = randomUUID();
    const { error: wineError } = await admin
      .from("wines_v2")
      .insert({ id: newId, ...result.wineRow });
    if (wineError) return Response.json({ error: wineError.message }, { status: 500 });
    await admin.from("wine_records").update({ wine_id: newId }).eq("id", recordId);
    return Response.json({ ok: true, wine_id: newId });
  }

  return Response.json({ ok: true });
}
