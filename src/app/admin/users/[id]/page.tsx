import { requireAdmin } from "@/lib/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import AdminRecordActions from "../../records/RecordActions";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", id).single();
  if (!profile) notFound();

  const { data: records } = await supabase
    .from("wine_records")
    .select("id, name, wine_type, rating, price, drunk_at, deleted_at, created_at")
    .eq("user_id", id)
    .order("created_at", { ascending: false });

  const { data: wishlist } = await supabase
    .from("wine_wishlist")
    .select("id, name_ko, name_en, created_at")
    .eq("user_id", id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/users" className="text-zinc-500 hover:text-zinc-300">←</Link>
        <h1 className="text-2xl font-bold">{profile.nickname}</h1>
        <span className="text-sm text-zinc-500">({id.substring(0, 8)})</span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
          <p className="text-sm text-zinc-500">닉네임</p>
          <p className="font-semibold">{profile.nickname}</p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
          <p className="text-sm text-zinc-500">가입일</p>
          <p className="font-semibold">{new Date(profile.created_at).toLocaleDateString("ko-KR")}</p>
        </div>
      </div>

      {/* 와인 기록 */}
      <h2 className="text-lg font-semibold mb-3">와인 기록 ({records?.length ?? 0}개)</h2>
      {records && records.length > 0 ? (
        <div className="overflow-x-auto mb-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-left">
                <th className="py-2 pr-3">와인명</th>
                <th className="py-2 pr-3">평점</th>
                <th className="py-2 pr-3">가격</th>
                <th className="py-2 pr-3">음용일</th>
                <th className="py-2 pr-3">상태</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className={`border-b border-zinc-800/50 ${r.deleted_at ? "opacity-40" : ""}`}>
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
      ) : (
        <p className="text-zinc-500 text-sm mb-8">기록 없음</p>
      )}

      {/* 위시리스트 */}
      <h2 className="text-lg font-semibold mb-3">위시리스트 ({wishlist?.length ?? 0}개)</h2>
      {wishlist && wishlist.length > 0 ? (
        <div className="flex flex-col gap-2">
          {wishlist.map((w) => (
            <div key={w.id} className="flex items-center justify-between p-3 rounded-xl bg-zinc-900 border border-zinc-800">
              <div>
                <p className="text-sm font-medium">{w.name_ko}</p>
                <p className="text-xs text-zinc-500">{w.name_en}</p>
              </div>
              <span className="text-xs text-zinc-500">{new Date(w.created_at).toLocaleDateString("ko-KR")}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-zinc-500 text-sm">위시리스트 없음</p>
      )}
    </div>
  );
}
