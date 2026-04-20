import { createClient } from "@/lib/supabase/server";

type ReportType = "vivino_link" | "wine_name" | "other_info" | "custom";

const VALID_TYPES: ReportType[] = ["vivino_link", "wine_name", "other_info", "custom"];

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { wine_id?: string; report_type?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const wine_id = typeof body.wine_id === "string" ? body.wine_id.trim() : "";
  const report_type = body.report_type as ReportType;
  const description = typeof body.description === "string" ? body.description.trim() : "";

  if (!wine_id) return Response.json({ error: "wine_id가 필요합니다" }, { status: 400 });
  if (!VALID_TYPES.includes(report_type)) {
    return Response.json({ error: "report_type이 유효하지 않습니다" }, { status: 400 });
  }
  if (report_type === "custom" && description.length < 1) {
    return Response.json({ error: "직접 입력은 내용을 작성해주세요" }, { status: 400 });
  }
  if (description.length > 1000) {
    return Response.json({ error: "내용은 1000자 이하로 작성해주세요" }, { status: 400 });
  }

  // 와인 존재 확인
  const { data: wine } = await supabase.from("wines").select("id").eq("id", wine_id).single();
  if (!wine) return Response.json({ error: "와인을 찾을 수 없습니다" }, { status: 404 });

  // 중복 신고 방지: 같은 유저가 같은 와인·유형으로 이미 open 상태로 제출한 것이 있는지
  const { data: existing } = await supabase
    .from("wine_reports")
    .select("id")
    .eq("user_id", user.id)
    .eq("wine_id", wine_id)
    .eq("report_type", report_type)
    .eq("status", "open")
    .maybeSingle();

  if (existing) {
    return Response.json({ error: "이미 동일한 유형의 신고가 접수되어 있습니다", already: true }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("wine_reports")
    .insert({
      wine_id,
      user_id: user.id,
      report_type,
      description: description || null,
    })
    .select("id")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ id: data.id, success: true });
}
