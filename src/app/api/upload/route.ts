import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

// Service role client — RLS 완전 우회 (서버에서만 사용)
function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(request: Request) {
  // 사용자 인증 확인 (anon client로 세션만 확인)
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다" }, { status: 401 });

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "서버 설정 오류: SUPABASE_SERVICE_ROLE_KEY 없음" }, { status: 500 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File;
  if (!file) return Response.json({ error: "파일이 없습니다" }, { status: 400 });

  const admin = createAdminClient();

  // 버킷이 없으면 생성
  await admin.storage.createBucket("labels", { public: true }).catch(() => {});

  const path = `${user.id}/${Date.now()}.jpg`;
  const arrayBuffer = await file.arrayBuffer();

  const { error } = await admin.storage
    .from("labels")
    .upload(path, arrayBuffer, { contentType: "image/jpeg", upsert: true });

  if (error) {
    console.error("[upload] admin storage error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const { data: { publicUrl } } = admin.storage.from("labels").getPublicUrl(path);
  console.log("[upload] success:", publicUrl);
  return Response.json({ url: publicUrl });
}
