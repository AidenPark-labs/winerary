import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File;
  if (!file) return Response.json({ error: "파일이 없습니다" }, { status: 400 });

  // 버킷이 없으면 자동 생성
  await supabase.storage.createBucket("labels", { public: true }).catch(() => {});

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${user.id}/${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error } = await supabase.storage
    .from("labels")
    .upload(path, arrayBuffer, { contentType: file.type || "image/jpeg", upsert: true });

  if (error) return Response.json({ error: `이미지 업로드 실패: ${error.message}` }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage.from("labels").getPublicUrl(path);
  return Response.json({ url: publicUrl });
}
