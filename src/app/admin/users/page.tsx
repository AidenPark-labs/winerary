import { requireAdmin } from "@/lib/admin";
import Link from "next/link";

export default async function AdminUsersPage() {
  const { supabase } = await requireAdmin();

  // 프로필 + 각 유저의 기록 수
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, nickname, created_at")
    .order("created_at", { ascending: false });

  // 유저별 기록 수 조회
  const userStats = await Promise.all(
    (profiles ?? []).map(async (p) => {
      const [{ count: records }, { count: activeRecords }, { count: wishlist }] = await Promise.all([
        supabase.from("wine_records").select("*", { count: "exact", head: true }).eq("user_id", p.id),
        supabase.from("wine_records").select("*", { count: "exact", head: true }).eq("user_id", p.id).is("deleted_at", null),
        supabase.from("wine_wishlist").select("*", { count: "exact", head: true }).eq("user_id", p.id),
      ]);
      return { ...p, records: records ?? 0, activeRecords: activeRecords ?? 0, wishlist: wishlist ?? 0 };
    })
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">유저 관리</h1>
      <p className="text-zinc-500 text-sm mb-4">총 {userStats.length}명</p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500 text-left">
              <th className="py-3 pr-4">닉네임</th>
              <th className="py-3 pr-4">기록 (활성/전체)</th>
              <th className="py-3 pr-4">위시</th>
              <th className="py-3 pr-4">가입일</th>
              <th className="py-3"></th>
            </tr>
          </thead>
          <tbody>
            {userStats.map((u) => (
              <tr key={u.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/50">
                <td className="py-3 pr-4 font-medium">{u.nickname}</td>
                <td className="py-3 pr-4">
                  <span className="text-rose-400">{u.activeRecords}</span>
                  <span className="text-zinc-600">/{u.records}</span>
                </td>
                <td className="py-3 pr-4">{u.wishlist}</td>
                <td className="py-3 pr-4 text-zinc-500">{new Date(u.created_at).toLocaleDateString("ko-KR")}</td>
                <td className="py-3">
                  <Link
                    href={`/admin/users/${u.id}`}
                    className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                  >
                    상세
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
