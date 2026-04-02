import { createClient } from "@/lib/supabase/server";
import type { WineRecord } from "@/types";

const TYPE_LABEL: Record<string, string> = {
  red: "레드", white: "화이트", rose: "로제",
  sparkling: "스파클링", fortified: "주정강화", other: "기타",
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

  const byType = groupCount(all, (r) => r.type ?? "other");
  const byCountry = groupCount(all, (r) => r.country ?? "미상");
  const avgRating = avg(all, "rating");
  const avgBalance = avg(all, "balance");
  const avgComplexity = avg(all, "complexity");
  const avgValue = avg(all, "value_score");

  const topCountries = Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxCount = topCountries[0]?.[1] ?? 1;

  return (
    <div className="flex flex-col">
      <header className="px-5 pt-12 pb-6">
        <h1 className="text-2xl font-bold">와인 통계</h1>
        <p className="text-zinc-500 text-sm mt-1">총 {total}병의 와인을 기록했습니다</p>
      </header>

      {total === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 py-20">
          <span className="text-5xl">📊</span>
          <p className="text-zinc-400">아직 기록된 와인이 없어요</p>
        </div>
      ) : (
        <div className="px-4 pb-8 flex flex-col gap-6">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="총 기록" value={`${total}병`} emoji="🍾" />
            <StatCard label="평균 평점" value={avgRating ? avgRating.toFixed(1) : "-"} emoji="⭐" />
            <StatCard label="평균 밸런스" value={avgBalance ? avgBalance.toFixed(1) : "-"} emoji="⚖️" />
            <StatCard label="평균 가성비" value={avgValue ? avgValue.toFixed(1) : "-"} emoji="💰" />
          </div>

          {/* By type */}
          <section>
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">종류별</h2>
            <div className="flex flex-col gap-2">
              {Object.entries(byType)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <div key={type} className="flex items-center gap-3">
                    <span className="text-sm text-zinc-400 w-20">{TYPE_LABEL[type] ?? type}</span>
                    <div className="flex-1 h-2 rounded-full bg-zinc-800">
                      <div
                        className="h-2 rounded-full bg-rose-600"
                        style={{ width: `${(count / total) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm text-zinc-400 w-8 text-right">{count}</span>
                  </div>
                ))}
            </div>
          </section>

          {/* By country */}
          {topCountries.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">국가별 TOP 5</h2>
              <div className="flex flex-col gap-2">
                {topCountries.map(([country, count]) => (
                  <div key={country} className="flex items-center gap-3">
                    <span className="text-sm text-zinc-400 w-24 truncate">{country}</span>
                    <div className="flex-1 h-2 rounded-full bg-zinc-800">
                      <div
                        className="h-2 rounded-full bg-amber-600"
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm text-zinc-400 w-8 text-right">{count}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Avg scores */}
          <section>
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">평균 품평</h2>
            <div className="flex flex-col gap-3">
              {[
                { label: "밸런스", value: avgBalance },
                { label: "복잡성", value: avgComplexity },
                { label: "가성비", value: avgValue },
              ].map(({ label, value }) => value ? (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-sm text-zinc-400 w-20">{label}</span>
                  <div className="flex-1 h-2 rounded-full bg-zinc-800">
                    <div className="h-2 rounded-full bg-purple-600" style={{ width: `${(value / 5) * 100}%` }} />
                  </div>
                  <span className="text-sm text-purple-400 w-8 text-right">{value.toFixed(1)}</span>
                </div>
              ) : null)}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function groupCount<T>(arr: T[], key: (item: T) => string): Record<string, number> {
  return arr.reduce((acc, item) => {
    const k = key(item);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function avg(arr: WineRecord[], key: keyof WineRecord): number | null {
  const vals = arr.map((r) => r[key] as number | null).filter((v): v is number => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
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
