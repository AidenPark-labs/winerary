import { createClient } from "@/lib/supabase/server";
import type { WineRecord } from "@/types";

export default async function StatsPage() {
  const supabase = await createClient();
  const { data: records } = await supabase
    .from("wine_records")
    .select("*")
    .is("deleted_at", null)
    .order("drunk_at", { ascending: false });

  const all = (records ?? []) as WineRecord[];
  const total = all.length;

  const ratings = all.map((r) => r.rating).filter((v): v is number => v != null);
  const pairingScores = all.map((r) => r.pairing_score).filter((v): v is number => v != null);
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  const avgPairing = pairingScores.length ? pairingScores.reduce((a, b) => a + b, 0) / pairingScores.length : null;

  // 월별 기록 수 (최근 6개월)
  const monthCounts: Record<string, number> = {};
  all.forEach((r) => {
    const key = r.drunk_at.slice(0, 7); // "YYYY-MM"
    monthCounts[key] = (monthCounts[key] ?? 0) + 1;
  });
  const recentMonths = Object.entries(monthCounts).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6).reverse();
  const maxMonthCount = recentMonths[0] ? Math.max(...recentMonths.map(([, c]) => c)) : 1;

  // 자주 먹은 페어링 음식
  const foodCount: Record<string, number> = {};
  all.forEach((r) => {
    (r.foods ?? []).forEach((f) => {
      const name = f.name;
      foodCount[name] = (foodCount[name] ?? 0) + 1;
    });
  });
  const topFoods = Object.entries(foodCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="flex flex-col">
      <header className="px-5 pt-12 pb-6">
        <h1 className="text-2xl font-bold">와인 통계</h1>
        <p className="text-zinc-500 text-sm mt-1">총 {total}번의 와인 경험을 기록했습니다</p>
      </header>

      {total === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 py-20">
          <span className="text-5xl">📊</span>
          <p className="text-zinc-400">아직 기록된 와인이 없어요</p>
        </div>
      ) : (
        <div className="px-4 pb-8 flex flex-col gap-6">

          {/* 요약 */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="총 기록" value={`${total}번`} emoji="🍾" />
            <StatCard label="평균 평점" value={avgRating ? avgRating.toFixed(1) : "-"} emoji="⭐" />
            <StatCard label="평균 페어링" value={avgPairing ? avgPairing.toFixed(1) : "-"} emoji="🍽️" />
            <StatCard label="페어링 기록" value={`${pairingScores.length}번`} emoji="🥗" />
          </div>

          {/* 월별 */}
          {recentMonths.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">월별 기록</h2>
              <div className="flex flex-col gap-2">
                {recentMonths.map(([month, count]) => (
                  <div key={month} className="flex items-center gap-3">
                    <span className="text-sm text-zinc-400 w-20">{month.slice(5)}월</span>
                    <div className="flex-1 h-2 rounded-full bg-zinc-800">
                      <div className="h-2 rounded-full bg-rose-600" style={{ width: `${(count / maxMonthCount) * 100}%` }} />
                    </div>
                    <span className="text-sm text-zinc-400 w-6 text-right">{count}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 자주 페어링한 음식 */}
          {topFoods.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">자주 페어링한 음식</h2>
              <div className="flex flex-col gap-2">
                {topFoods.map(([food, count]) => (
                  <div key={food} className="flex items-center gap-3">
                    <span className="text-sm text-zinc-400 w-28 truncate">{food}</span>
                    <div className="flex-1 h-2 rounded-full bg-zinc-800">
                      <div className="h-2 rounded-full bg-amber-600" style={{ width: `${(count / (topFoods[0][1])) * 100}%` }} />
                    </div>
                    <span className="text-sm text-zinc-400 w-6 text-right">{count}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, emoji }: { label: string; value: string; emoji: string }) {
  return (
    <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex flex-col gap-1">
      <span className="text-2xl">{emoji}</span>
      <span className="text-xl font-bold">{value}</span>
      <span className="text-xs text-zinc-500">{label}</span>
    </div>
  );
}
