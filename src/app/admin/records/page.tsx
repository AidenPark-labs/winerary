import { requireAdmin } from "@/lib/admin";
import AdminRecordActions from "./RecordActions";

const TYPE_KO: Record<string, string> = {
  red: "레드 🍷", white: "화이트 🥂", rose: "로제 🌸",
  sparkling: "스파클링 ✨", fortified: "주정강화 🏺", other: "기타",
};

export default async function AdminRecordsPage() {
  const { supabase: admin } = await requireAdmin();

  const { data: records } = await admin
    .from("wine_records")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const userIds = [...new Set((records ?? []).map((r: any) => r.user_id))];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, nickname, avatar_url")
    .in("id", userIds);
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  const total = records?.length ?? 0;
  const active = records?.filter((r: any) => !r.deleted_at).length ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">와인 기록 관리</h1>
      <p className="text-zinc-500 text-sm mb-6">최근 100개 | 활성 {active} / 전체 {total}</p>

      <div className="flex flex-col gap-4">
        {(records ?? []).map((r: any) => {
          const profile = profileMap.get(r.user_id);
          const photos: string[] = r.photos ?? [];
          const foods: { name: string }[] = (r.foods as { name: string }[]) ?? [];
          const thumb = photos[0];

          return (
            <div
              key={r.id}
              className={`rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 ${r.deleted_at ? "opacity-40" : ""}`}
            >
              {/* 사진 영역 */}
              {thumb ? (
                <div className="relative w-full" style={{ height: "200px" }}>
                  <img src={thumb} alt={r.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  {r.wine_type && (
                    <span className="absolute top-3 left-3 text-[11px] px-2.5 py-0.5 rounded-full bg-black/50 backdrop-blur-sm text-zinc-300">
                      {TYPE_KO[r.wine_type] ?? r.wine_type}
                    </span>
                  )}
                  {photos.length > 1 && (
                    <span className="absolute top-3 right-3 text-[11px] px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-sm text-zinc-300">
                      📷 {photos.length}
                    </span>
                  )}
                  {r.deleted_at && (
                    <span className="absolute top-3 right-3 text-xs px-2 py-0.5 rounded-full bg-rose-900/80 text-rose-300">삭제됨</span>
                  )}
                </div>
              ) : (
                <div className="relative w-full flex items-center justify-center bg-gradient-to-br from-rose-950/40 via-zinc-900 to-zinc-950" style={{ height: "80px" }}>
                  <span className="text-3xl opacity-30">🍷</span>
                  {r.wine_type && (
                    <span className="absolute top-3 left-3 text-[11px] px-2.5 py-0.5 rounded-full bg-white/10 text-zinc-400">
                      {TYPE_KO[r.wine_type] ?? r.wine_type}
                    </span>
                  )}
                  {r.deleted_at && (
                    <span className="absolute top-3 right-3 text-xs px-2 py-0.5 rounded-full bg-rose-900/80 text-rose-300">삭제됨</span>
                  )}
                </div>
              )}

              {/* 정보 영역 */}
              <div className="px-4 py-3 flex flex-col gap-2">
                {/* 유저 정보 */}
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span>👤 {profile?.nickname ?? "알 수 없음"}</span>
                  <span>·</span>
                  <span>{new Date(r.created_at).toLocaleDateString("ko-KR")}</span>
                  {!r.deleted_at ? (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-400">활성</span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">삭제됨</span>
                  )}
                </div>

                {/* 와인명 + 평점 */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white text-base leading-tight">{r.name}</p>
                    {r.wine_name_original && (
                      <p className="text-xs text-zinc-500 italic mt-0.5">{r.wine_name_original}</p>
                    )}
                  </div>
                  {r.rating != null && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-yellow-400 text-sm">★</span>
                      <span className="text-sm font-semibold text-white">{Number(r.rating).toFixed(1)}</span>
                    </div>
                  )}
                </div>

                {/* 상세 정보 */}
                <div className="flex items-center gap-2 flex-wrap text-xs text-zinc-500">
                  {r.wine_country && <span>📍 {r.wine_country}</span>}
                  {r.grape_variety && <span>🍇 {r.grape_variety}</span>}
                  {r.wine_vintage && <span>📅 {r.wine_vintage}</span>}
                  {r.price != null && <span>💰 {r.price.toLocaleString()}원</span>}
                  {r.value_score != null && <span>가성비 {r.value_score}</span>}
                </div>

                {/* 음용 정보 */}
                <div className="text-xs text-zinc-600">
                  {new Date(r.drunk_at).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" })}
                  {r.location && ` · ${r.location}`}
                  {r.companions?.length > 0 && ` · 👥 ${r.companions.join(", ")}`}
                </div>

                {/* 음식 */}
                {foods.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {foods.map((f, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                        🍽 {f.name}
                      </span>
                    ))}
                    {r.pairing_score != null && (
                      <span className="text-xs text-zinc-500">궁합 ★{r.pairing_score}</span>
                    )}
                  </div>
                )}

                {/* 메모 */}
                {r.memo && (
                  <p className="text-xs text-zinc-400 bg-zinc-800/50 rounded-lg p-2 mt-1">💬 {r.memo}</p>
                )}

                {/* 액션 */}
                <div className="flex items-center justify-between mt-1 pt-2 border-t border-zinc-800">
                  <span className="text-[10px] text-zinc-600 font-mono">{r.id.slice(0, 8)}</span>
                  <AdminRecordActions recordId={r.id} deleted={!!r.deleted_at} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
