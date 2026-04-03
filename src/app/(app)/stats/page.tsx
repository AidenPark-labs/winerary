import { createClient } from "@/lib/supabase/server";
import type { WineRecord } from "@/types";

const TYPE_META: Record<string, { label: string; color: string }> = {
  red:       { label: "레드",    color: "#be123c" },
  white:     { label: "화이트",  color: "#d97706" },
  rose:      { label: "로제",    color: "#ec4899" },
  sparkling: { label: "스파클링", color: "#0ea5e9" },
  fortified: { label: "주정강화", color: "#8b5cf6" },
  other:     { label: "기타",    color: "#52525b" },
};

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
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

  // 와인 종류 분포
  const typeCounts: Record<string, number> = {};
  all.forEach((r) => {
    if (r.wine_type) typeCounts[r.wine_type] = (typeCounts[r.wine_type] ?? 0) + 1;
  });
  const typeSegments = Object.entries(TYPE_META)
    .map(([key, meta]) => ({ key, ...meta, count: typeCounts[key] ?? 0 }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);
  const typeTotal = typeSegments.reduce((s, x) => s + x.count, 0);

  // 선호 품종 Top 6
  const grapeCounts: Record<string, number> = {};
  all.forEach((r) => {
    if (r.grape_variety) {
      r.grape_variety.split(/[,\/·&]+/).map((g) => g.trim()).filter(Boolean).forEach((g) => {
        grapeCounts[g] = (grapeCounts[g] ?? 0) + 1;
      });
    }
  });
  const topGrapes = Object.entries(grapeCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);

  // 생산 국가 Top 5
  const countryCounts: Record<string, number> = {};
  all.forEach((r) => {
    if (r.wine_country) countryCounts[r.wine_country] = (countryCounts[r.wine_country] ?? 0) + 1;
  });
  const topCountries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // 월별 기록 (최근 6개월)
  const monthCounts: Record<string, number> = {};
  all.forEach((r) => {
    const key = r.drunk_at.slice(0, 7);
    monthCounts[key] = (monthCounts[key] ?? 0) + 1;
  });
  const recentMonths = Object.entries(monthCounts).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6).reverse();
  const maxMonthCount = recentMonths.length ? Math.max(...recentMonths.map(([, c]) => c)) : 1;

  // 자주 페어링한 음식
  const foodCount: Record<string, number> = {};
  all.forEach((r) => {
    (r.foods ?? []).forEach((f) => {
      foodCount[f.name] = (foodCount[f.name] ?? 0) + 1;
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
        <div className="px-4 pb-28 flex flex-col gap-6">

          {/* 요약 */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="총 기록" value={`${total}번`} emoji="🍾" />
            <StatCard label="평균 평점" value={avgRating ? avgRating.toFixed(1) : "-"} emoji="⭐" />
          </div>

          {/* 와인 종류 도넛 차트 */}
          {typeSegments.length > 0 && (
            <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">와인 종류</h2>
              <div className="flex items-center gap-6">
                <DonutChart segments={typeSegments.map((s) => ({ label: s.label, value: s.count, color: s.color }))} total={typeTotal} />
                <div className="flex flex-col gap-2 flex-1 min-w-0">
                  {typeSegments.map((s) => (
                    <div key={s.key} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-sm text-zinc-300 flex-1 truncate">{s.label}</span>
                      <span className="text-sm font-semibold text-white">{s.count}</span>
                      <span className="text-xs text-zinc-500 w-9 text-right">{Math.round((s.count / typeTotal) * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* 선호 품종 */}
          {topGrapes.length > 0 && (
            <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">선호 품종</h2>
              <div className="flex flex-col gap-3">
                {topGrapes.map(([grape, count], i) => (
                  <div key={grape} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-600 w-4">{i + 1}</span>
                        <span className="text-sm text-zinc-200">{grape}</span>
                      </div>
                      <span className="text-sm font-semibold text-white">{count}번</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-800 ml-6">
                      <div
                        className="h-1.5 rounded-full bg-rose-600"
                        style={{ width: `${(count / topGrapes[0][1]) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 생산 국가 */}
          {topCountries.length > 0 && (
            <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">생산 국가</h2>
              <div className="flex flex-col gap-3">
                {topCountries.map(([country, count], i) => (
                  <div key={country} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-600 w-4">{i + 1}</span>
                        <span className="text-sm text-zinc-200">{country}</span>
                      </div>
                      <span className="text-sm font-semibold text-white">{count}번</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-800 ml-6">
                      <div
                        className="h-1.5 rounded-full bg-amber-600"
                        style={{ width: `${(count / topCountries[0][1]) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 월별 기록 */}
          {recentMonths.length > 0 && (
            <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">월별 기록</h2>
              <div className="flex items-end gap-2 h-28">
                {recentMonths.map(([month, count]) => (
                  <div key={month} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-zinc-400">{count}</span>
                    <div className="w-full rounded-t-md bg-rose-700/80" style={{ height: `${(count / maxMonthCount) * 72}px` }} />
                    <span className="text-[10px] text-zinc-500">{month.slice(5)}월</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 자주 페어링한 음식 */}
          {topFoods.length > 0 && (
            <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">자주 페어링한 음식</h2>
              <div className="flex flex-col gap-3">
                {topFoods.map(([food, count], i) => (
                  <div key={food} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-600 w-4">{i + 1}</span>
                        <span className="text-sm text-zinc-200">{food}</span>
                      </div>
                      <span className="text-sm font-semibold text-white">{count}번</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-800 ml-6">
                      <div
                        className="h-1.5 rounded-full bg-emerald-600"
                        style={{ width: `${(count / topFoods[0][1]) * 100}%` }}
                      />
                    </div>
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

function DonutChart({ segments, total }: {
  segments: { label: string; value: number; color: string }[];
  total: number;
}) {
  const r = 54;
  const cx = 80;
  const cy = 80;
  const circumference = 2 * Math.PI * r;
  const gap = total > 1 ? 3 : 0; // gap between segments in px

  let offset = 0;
  const paths = segments.map((seg) => {
    const arc = Math.max((seg.value / total) * circumference - gap, 0);
    const result = { ...seg, dashArray: `${arc} ${circumference}`, dashOffset: -offset };
    offset += (seg.value / total) * circumference;
    return result;
  });

  return (
    <svg viewBox="0 0 160 160" width={120} height={120} style={{ flexShrink: 0 }}>
      <g transform="rotate(-90 80 80)">
        {paths.map((p, i) => (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={p.color}
            strokeWidth="22"
            strokeDasharray={p.dashArray}
            strokeDashoffset={p.dashOffset}
          />
        ))}
      </g>
      <text x="80" y="74" textAnchor="middle" fontSize="26" fontWeight="700" fill="white">{total}</text>
      <text x="80" y="93" textAnchor="middle" fontSize="12" fill="#71717a">기록</text>
    </svg>
  );
}
