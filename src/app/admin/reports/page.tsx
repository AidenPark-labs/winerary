import { requireAdmin } from "@/lib/admin";
import ReportsClient, { type ReportRow } from "./ReportsClient";

type Status = "open" | "resolved" | "dismissed";

const ALLOWED: Status[] = ["open", "resolved", "dismissed"];

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const { supabase } = await requireAdmin();
  const sp = (await searchParams) ?? {};
  const status: Status = ALLOWED.includes(sp.status as Status) ? (sp.status as Status) : "open";

  // 상태별 카운트
  const counts: Record<Status, number> = { open: 0, resolved: 0, dismissed: 0 };
  const countPromises = ALLOWED.map(async (s) => {
    const { count } = await supabase
      .from("wine_reports")
      .select("id", { count: "exact", head: true })
      .eq("status", s);
    counts[s] = count ?? 0;
  });
  await Promise.all(countPromises);

  // 신고 목록 (현재 상태)
  const { data: reports } = await supabase
    .from("wine_reports")
    .select(`
      id, wine_id, user_id, report_type, description, status,
      created_at, resolved_at, resolved_by, resolved_note,
      wines (
        id, name_ko, name_en, wine_type, country, region, grape_variety, producer,
        vivino_url, vivino_page_url, vivino_rating, vivino_winery, vivino_region, vivino_grapes, vivino_style,
        final_wine_type, final_grapes, final_country, final_region, final_producer, final_alcohol, final_style, final_description
      ),
      reporter:profiles!wine_reports_user_id_fkey (nickname, user_code)
    `)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(500);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">와인 신고</h1>
        <p className="text-zinc-500 text-sm mt-1">사용자가 신고한 와인 정보 오류를 확인하고 바로 수정할 수 있어요.</p>
      </div>
      <ReportsClient
        reports={(reports ?? []) as unknown as ReportRow[]}
        status={status}
        counts={counts}
      />
    </div>
  );
}
