import { requireAdmin } from "@/lib/admin";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import AdminRecordActions from "./RecordActions";

export default async function AdminRecordsPage() {
  await requireAdmin();

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 전체 기록 (최신순, 삭제 포함)
  const { data: records } = await admin
    .from("wine_records")
    .select("id, user_id, name, wine_type, rating, price, drunk_at, deleted_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  // 유저 닉네임 매핑
  const userIds = [...new Set((records ?? []).map((r) => r.user_id))];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, nickname")
    .in("id", userIds);
  const nickMap = new Map((profiles ?? []).map((p) => [p.id, p.nickname]));

  const total = records?.length ?? 0;
  const active = records?.filter((r) => !r.deleted_at).length ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">와인 기록 관리</h1>
      <p className="text-zinc-500 text-sm mb-6">최근 100개 | 활성 {active} / 전체 {total}</p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500 text-left">
              <th className="py-2 pr-3">유저</th>
              <th className="py-2 pr-3">와인명</th>
              <th className="py-2 pr-3">평점</th>
              <th className="py-2 pr-3">가격</th>
              <th className="py-2 pr-3">음용일</th>
              <th className="py-2 pr-3">상태</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(records ?? []).map((r) => (
              <tr key={r.id} className={`border-b border-zinc-800/50 ${r.deleted_at ? "opacity-40" : ""}`}>
                <td className="py-2 pr-3 text-zinc-400">{nickMap.get(r.user_id) ?? "?"}</td>
                <td className="py-2 pr-3 font-medium max-w-[200px] truncate">{r.name}</td>
                <td className="py-2 pr-3">{r.rating ? `★ ${r.rating}` : "-"}</td>
                <td className="py-2 pr-3">{r.price ? `${r.price.toLocaleString()}원` : "-"}</td>
                <td className="py-2 pr-3 text-zinc-500">{r.drunk_at}</td>
                <td className="py-2 pr-3">
                  {r.deleted_at ? (
                    <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-500">삭제됨</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-900/50 text-emerald-400">활성</span>
                  )}
                </td>
                <td className="py-2">
                  <AdminRecordActions recordId={r.id} deleted={!!r.deleted_at} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
