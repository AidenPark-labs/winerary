import { requireAdmin } from "@/lib/admin";

export default async function AdminDashboard() {
  const { supabase } = await requireAdmin();

  const [
    { count: userCount },
    { count: recordCount },
    { count: activeRecordCount },
    { count: wineDbCount },
    { count: wishlistCount },
    { count: vivinoCount },
    { count: pendingCount },
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("wine_records").select("*", { count: "exact", head: true }),
    supabase.from("wine_records").select("*", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("wines").select("*", { count: "exact", head: true }),
    supabase.from("wine_wishlist").select("*", { count: "exact", head: true }),
    supabase.from("vivino_wines").select("*", { count: "exact", head: true }).not("rating", "is", null),
    supabase.from("pending_wines").select("*", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  const stats = [
    { label: "가입 유저", value: userCount ?? 0, emoji: "👤" },
    { label: "와인 기록 (전체)", value: recordCount ?? 0, emoji: "📝" },
    { label: "와인 기록 (활성)", value: activeRecordCount ?? 0, emoji: "🍷" },
    { label: "와인 DB", value: wineDbCount ?? 0, emoji: "🗄️" },
    { label: "편입 대기", value: pendingCount ?? 0, emoji: "⏳" },
    { label: "위시리스트", value: wishlistCount ?? 0, emoji: "❤️" },
    { label: "Vivino 별점 보유", value: vivinoCount ?? 0, emoji: "⭐" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">대시보드</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800">
            <span className="text-2xl">{s.emoji}</span>
            <p className="text-3xl font-bold mt-2">{s.value.toLocaleString()}</p>
            <p className="text-sm text-zinc-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
