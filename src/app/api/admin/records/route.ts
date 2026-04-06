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

  const { recordId, action } = await request.json();
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
  }

  return Response.json({ ok: true });
}
