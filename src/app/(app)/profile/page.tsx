import { createClient } from "@/lib/supabase/server";
import type { WineRecord } from "@/types";
import LogoutButton from "./LogoutButton";
import AuthPrompt from "@/components/AuthPrompt";
import { User, Book, Star, BarChart3, Pencil, Heart } from "lucide-react";
import Link from "next/link";
import { GRAPE_OPTIONS } from "@/lib/grapes";

const TYPE_META: Record<string, { label: string; color: string }> = {
  red:       { label: "레드",    color: "#be123c" },
  white:     { label: "화이트",  color: "#d97706" },
  rose:      { label: "로제",    color: "#ec4899" },
  sparkling: { label: "스파클링", color: "#0ea5e9" },
  fortified: { label: "주정강화", color: "#8b5cf6" },
  other:     { label: "기타",    color: "#52525b" },
};

const CHART_COLORS = ["#e11d48", "#d97706", "#16a34a", "#0ea5e9", "#8b5cf6", "#52525b"];

const PRICE_RANGES = [
  { label: "~1만원", min: 0, max: 10000, color: "#16a34a" },
  { label: "1~3만원", min: 10000, max: 30000, color: "#0ea5e9" },
  { label: "3~5만원", min: 30000, max: 50000, color: "#d97706" },
  { label: "5~10만원", min: 50000, max: 100000, color: "#8b5cf6" },
  { label: "10만원~", min: 100000, max: Infinity, color: "#e11d48" },
];

const VALUE_BUCKETS = [
  { label: "~2만원", min: 0, max: 20000 },
  { label: "2~5만원", min: 20000, max: 50000 },
  { label: "5~10만원", min: 50000, max: 100000 },
  { label: "10만원~", min: 100000, max: Infinity },
];

export default async function MyWinePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <>
        <div className="flex flex-col">
          <header className="px-5 pt-8 pb-2">
            <h1 className="text-2xl font-bold text-white">마이페이지</h1>
          </header>
          <div className="px-4 pb-28 flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-surface border border-white/5 flex items-center justify-center text-lg shadow-sm backdrop-blur-md">
                <User className="w-6 h-6 text-zinc-600" />
              </div>
              <div>
                <div className="h-5 w-24 rounded bg-surface border border-white/5" />
                <div className="h-3 w-36 rounded bg-surface mt-2 border border-white/5" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="기록" value="-" icon={Book} />
              <StatCard label="종합 평점" value="-" icon={Star} />
            </div>
          </div>
        </div>
        <AuthPrompt message="나의 와인 통계와 프로필을 확인하려면 로그인이 필요합니다" />
      </>
    );
  }

  const [
    { data: profile },
    { data: records },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("wine_records").select("*").eq("user_id", user.id).is("deleted_at", null).order("drunk_at", { ascending: false }),
  ]);

  const all = (records ?? []) as WineRecord[];
  const total = all.length;

  // 종합 평점
  const overallScores = all.map((r) => {
    const scores = [r.rating, r.value_score, r.pairing_score].filter((v): v is number => v != null).map(Number);
    return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  }).filter((v): v is number => v != null);
  const avgOverall = overallScores.length ? overallScores.reduce((a, b) => a + b, 0) / overallScores.length : null;

  // 와인 종류 분포
  const typeCounts: Record<string, number> = {};
  all.forEach((r) => { if (r.wine_type) typeCounts[r.wine_type] = (typeCounts[r.wine_type] ?? 0) + 1; });
  const typeSegments = Object.entries(TYPE_META)
    .map(([key, meta]) => ({ key, ...meta, count: typeCounts[key] ?? 0 }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);
  const typeTotal = typeSegments.reduce((s, x) => s + x.count, 0);

  // 선호 품종 Top 6
  // 드롭다운에서 "시라/쉬라즈" 같이 슬래시로 묶인 품종은 동일 그룹으로 카운트
  const grapeAliasMap: Record<string, string> = {};
  GRAPE_OPTIONS.forEach((opt) => {
    if (opt.includes("/")) {
      opt.split("/").forEach((alias) => { grapeAliasMap[alias.trim()] = opt; });
    }
  });
  const normalizeGrape = (g: string) => grapeAliasMap[g] ?? g;

  const grapeCounts: Record<string, number> = {};
  all.forEach((r) => {
    if (!r.grape_variety) return;
    // 블렌드인 경우 개별 품종 대신 "블렌드"로 카운트
    if (r.grape_variety.startsWith("블렌드")) {
      grapeCounts["블렌드"] = (grapeCounts["블렌드"] ?? 0) + 1;
    } else {
      grapeCounts[normalizeGrape(r.grape_variety)] = (grapeCounts[normalizeGrape(r.grape_variety)] ?? 0) + 1;
    }
  });
  const topGrapes = Object.entries(grapeCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);

  // 1. 국가별 통계
  const countryCounts: Record<string, number> = {};
  all.forEach((r) => { if (r.wine_country) countryCounts[r.wine_country] = (countryCounts[r.wine_country] ?? 0) + 1; });
  const topCountries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const countryTotal = topCountries.reduce((s, [, c]) => s + c, 0);

  // 2. 자주 마신 와인
  // wine_id 우선, 없으면 이름 정규화 + 영문 원어명 fallback
  const normalizeWineName = (n: string) => n.replace(/[\u200b\u200c\u200d\ufeff\s·\-_''""()（）]/g, "").toLowerCase();
  const wineGroups: Record<string, { displayName: string; count: number }> = {};
  const wineIdToKey: Record<string, string> = {};
  const originalNameToKey: Record<string, string> = {};
  all.forEach((r) => {
    // wine_id가 있으면 가장 정확한 키로 사용
    if (r.wine_id && wineIdToKey[r.wine_id]) {
      const key = wineIdToKey[r.wine_id];
      wineGroups[key].count += 1;
      return;
    }
    const koKey = normalizeWineName(r.name);
    const origKey = r.wine_name_original ? normalizeWineName(r.wine_name_original) : null;
    const existingKey = origKey ? originalNameToKey[origKey] : undefined;
    const key = existingKey ?? koKey;
    if (!wineGroups[key]) wineGroups[key] = { displayName: r.name.replace(/^\u200b/, ""), count: 0 };
    wineGroups[key].count += 1;
    if (r.wine_id) wineIdToKey[r.wine_id] = key;
    if (origKey && !originalNameToKey[origKey]) originalNameToKey[origKey] = key;
  });
  const topWines = Object.values(wineGroups)
    .sort((a, b) => b.count - a.count)
    .filter((w) => w.count >= 2)
    .slice(0, 8);

  // 3. 같이 마신 사람
  const companionCounts: Record<string, number> = {};
  all.forEach((r) => { (r.companions ?? []).forEach((c) => { companionCounts[c] = (companionCounts[c] ?? 0) + 1; }); });
  const topCompanions = Object.entries(companionCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);

  // 4. 가성비 분석
  const valuePairs = all.filter((r) => r.price != null && r.price > 0 && r.rating != null);
  const bucketStats = VALUE_BUCKETS.map((b) => {
    const items = valuePairs.filter((v) => v.price! >= b.min && v.price! < b.max);
    const avgRating = items.length ? items.reduce((s, v) => s + Number(v.rating!), 0) / items.length : null;
    return { ...b, count: items.length, avgRating };
  }).filter((b) => b.count > 0);

  // 5. 페어링 음식
  const foodStats: Record<string, { count: number; totalScore: number; scored: number }> = {};
  all.forEach((r) => {
    (r.foods ?? []).forEach((f) => {
      const entry = foodStats[f.name] ?? { count: 0, totalScore: 0, scored: 0 };
      entry.count += 1;
      if (r.pairing_score != null) { entry.totalScore += r.pairing_score; entry.scored += 1; }
      foodStats[f.name] = entry;
    });
  });
  const topFoods = Object.entries(foodStats)
    .map(([name, s]) => ({ name, count: s.count, avgScore: s.scored > 0 ? s.totalScore / s.scored : null }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // 6. 장소별 통계
  const placeCounts: Record<string, number> = {};
  all.forEach((r) => { if (r.place_name) placeCounts[r.place_name] = (placeCounts[r.place_name] ?? 0) + 1; });
  const topPlaces = Object.entries(placeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // 7. 가격대별 분석
  const priceDistribution = PRICE_RANGES.map((range) => {
    const count = all.filter((r) => r.price != null && r.price >= range.min && r.price < range.max).length;
    return { ...range, count };
  }).filter((r) => r.count > 0);
  const priceTotal = priceDistribution.reduce((s, r) => s + r.count, 0);
  const pricedRecords = all.filter((r) => r.price != null && r.price > 0);
  const avgPrice = pricedRecords.length ? Math.round(pricedRecords.reduce((s, r) => s + r.price!, 0) / pricedRecords.length) : null;

  return (
    <div className="flex flex-col">
      <header className="px-5 pt-12 pb-4">
        <h1 className="text-2xl font-serif tracking-wide text-white">마이페이지</h1>
      </header>

      <div className="px-4 pb-28 flex flex-col gap-6">
        {/* 프로필 카드 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-surface border border-white/5 flex items-center justify-center text-xl font-serif text-white shadow-lg backdrop-blur-md">
              <span className="bg-clip-text text-transparent bg-gradient-to-br from-accent to-rose-400">
                {profile?.nickname?.[0] ?? "U"}
              </span>
            </div>
            <div>
              <p className="text-lg font-serif text-white">{profile?.nickname ?? "사용자"}</p>
              <p className="text-xs text-zinc-500 font-light mt-0.5">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/profile/edit"
              className="px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-accent text-zinc-400 hover:text-accent text-xs transition-colors flex items-center gap-1"
            >
              <Pencil className="w-3 h-3" />
              수정
            </Link>
            <LogoutButton />
          </div>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="기록" value={`${total}`} icon={Book} />
          <StatCard label="종합 평점" value={avgOverall ? avgOverall.toFixed(1) : "-"} icon={Star} />
        </div>

        {/* 메뉴 */}
        <Link
          href="/profile/wishlist"
          className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-surface/80 border border-white/5 hover:bg-white/5 transition-colors"
        >
          <Heart size={18} className="text-accent" />
          <span className="text-sm text-white font-medium flex-1">내 와인</span>
          <span className="text-zinc-600 text-sm">›</span>
        </Link>

        {total === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <BarChart3 className="w-16 h-16 text-zinc-800" strokeWidth={1} />
            <p className="text-zinc-500 text-sm font-light">아직 기록된 와인이 없어요</p>
            <a href="/diary/new" className="text-accent text-sm hover:underline font-light mt-1">첫 와인 기록하기 →</a>
          </div>
        ) : (
          <>
            {/* 와인 종류 */}
            {typeSegments.length > 0 && (
              <section className="rounded-2xl bg-surface/80 border border-white/5 p-5 backdrop-blur-md shadow-sm">
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
              <section className="rounded-2xl bg-surface/80 border border-white/5 p-5 backdrop-blur-md shadow-sm">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">선호 품종</h2>
                <RankedBarList items={topGrapes.map(([grape, count]) => ({ label: grape, value: count }))} color="#be123c" />
              </section>
            )}

            {/* 1. 국가 */}
            {topCountries.length > 0 && (
              <section className="rounded-2xl bg-surface/80 border border-white/5 p-5 backdrop-blur-md shadow-sm">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">생산 국가</h2>
                <div className="flex items-center gap-6">
                  <DonutChart
                    segments={topCountries.map(([name, count], i) => ({
                      label: name, value: count, color: CHART_COLORS[i % CHART_COLORS.length],
                    }))}
                    total={countryTotal}
                  />
                  <div className="flex flex-col gap-2 flex-1 min-w-0">
                    {topCountries.map(([name, count], i) => (
                      <div key={name} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-sm text-zinc-300 flex-1 truncate">{name}</span>
                        <span className="text-sm font-semibold text-white">{count}</span>
                        <span className="text-xs text-zinc-500 w-9 text-right">{Math.round((count / countryTotal) * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* 2. 자주 마신 와인 */}
            <section className="rounded-2xl bg-surface/80 border border-white/5 p-5 backdrop-blur-md shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">자주 마신 와인</h2>
              {topWines.length > 0 ? (
                <RankedBarList items={topWines.map((w) => ({ label: w.displayName, value: w.count }))} color="#e11d48" />
              ) : (
                <p className="text-sm text-zinc-600 text-center py-4">아직 재음한 와인이 없어요</p>
              )}
            </section>

            {/* 3. 같이 마신 사람 */}
            {topCompanions.length > 0 && (
              <section className="rounded-2xl bg-surface/80 border border-white/5 p-5 backdrop-blur-md shadow-sm">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">같이 마신 사람</h2>
                <RankedBarList items={topCompanions.map(([name, count]) => ({ label: name, value: count }))} color="#8b5cf6" />
              </section>
            )}

            {/* 4. 가성비 분석 */}
            {bucketStats.length >= 2 && (
              <section className="rounded-2xl bg-surface/80 border border-white/5 p-5 backdrop-blur-md shadow-sm">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">가성비 분석</h2>
                <div className="flex flex-col gap-3">
                  {bucketStats.map((b) => (
                    <div key={b.label} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-zinc-300">{b.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">{b.avgRating!.toFixed(1)}</span>
                          <span className="text-xs text-zinc-500">({b.count}건)</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-zinc-800">
                        <div className="h-1.5 rounded-full bg-amber-600" style={{ width: `${(b.avgRating! / 5) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                {(() => {
                  const best = bucketStats.reduce((a, b) => (b.avgRating ?? 0) > (a.avgRating ?? 0) ? b : a);
                  return (
                    <p className="text-xs text-zinc-500 mt-4 text-center">
                      가장 높은 평점 가격대: <span className="text-amber-500 font-medium">{best.label}</span> ({best.avgRating!.toFixed(1)}점)
                    </p>
                  );
                })()}
              </section>
            )}

            {/* 5. 페어링 음식 */}
            {topFoods.length > 0 && (
              <section className="rounded-2xl bg-surface/80 border border-white/5 p-5 backdrop-blur-md shadow-sm">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">페어링 음식</h2>
                <div className="flex flex-col gap-3">
                  {topFoods.map((food, i) => (
                    <div key={food.name} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-xs font-bold text-zinc-600 w-4">{i + 1}</span>
                          <span className="text-sm text-zinc-200 truncate">{food.name}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {food.avgScore != null && (
                            <span className="text-xs text-emerald-400 font-medium">★ {food.avgScore.toFixed(1)}</span>
                          )}
                          <span className="text-sm font-semibold text-white">{food.count}번</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-zinc-800 ml-6">
                        <div className="h-1.5 rounded-full bg-emerald-600" style={{ width: `${(food.count / topFoods[0].count) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 6. 장소별 통계 */}
            {topPlaces.length > 0 && (
              <section className="rounded-2xl bg-surface/80 border border-white/5 p-5 backdrop-blur-md shadow-sm">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">자주 가는 장소</h2>
                <RankedBarList items={topPlaces.map(([name, count]) => ({ label: name, value: count }))} color="#0ea5e9" />
              </section>
            )}

            {/* 7. 가격대별 분석 */}
            {priceDistribution.length > 0 && (
              <section className="rounded-2xl bg-surface/80 border border-white/5 p-5 backdrop-blur-md shadow-sm">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">가격대별 분석</h2>
                <StackedBar segments={priceDistribution.map((r) => ({ color: r.color, value: r.count }))} total={priceTotal} />
                <div className="flex flex-col gap-2 mt-4">
                  {priceDistribution.map((r) => (
                    <div key={r.label} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                      <span className="text-sm text-zinc-300 flex-1">{r.label}</span>
                      <span className="text-sm font-semibold text-white">{r.count}</span>
                      <span className="text-xs text-zinc-500 w-9 text-right">{Math.round((r.count / priceTotal) * 100)}%</span>
                    </div>
                  ))}
                </div>
                {avgPrice && (
                  <p className="text-xs text-zinc-500 mt-4 text-center">
                    평균 가격: <span className="text-white font-semibold">{avgPrice.toLocaleString("ko-KR")}원</span>
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Inline Components ── */

function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="p-4 rounded-2xl bg-surface/80 border border-white/5 backdrop-blur-md flex flex-col justify-center items-center gap-1.5 shadow-sm">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-accent" />
        <span className="text-2xl font-serif text-white drop-shadow-sm leading-none">{value}</span>
      </div>
      <span className="text-[11px] text-zinc-500 font-light tracking-wide uppercase">{label}</span>
    </div>
  );
}

function DonutChart({ segments, total }: { segments: { label: string; value: number; color: string }[]; total: number }) {
  const r = 54;
  const cx = 80;
  const cy = 80;
  const circumference = 2 * Math.PI * r;
  const gap = total > 1 ? 3 : 0;

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

function RankedBarList({ items, color }: { items: { label: string; value: number }[]; color: string }) {
  const max = items[0]?.value ?? 1;
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => (
        <div key={item.label} className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-xs font-bold text-zinc-600 w-4">{i + 1}</span>
              <span className="text-sm text-zinc-200 truncate">{item.label}</span>
            </div>
            <span className="text-sm font-semibold text-white flex-shrink-0">{item.value}번</span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-800 ml-6">
            <div className="h-1.5 rounded-full" style={{ width: `${(item.value / max) * 100}%`, backgroundColor: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function StackedBar({ segments, total }: { segments: { color: string; value: number }[]; total: number }) {
  return (
    <div className="h-2 rounded-full bg-zinc-800 flex overflow-hidden">
      {segments.map((seg, i) => (
        <div
          key={i}
          className="h-full first:rounded-l-full last:rounded-r-full"
          style={{ width: `${(seg.value / total) * 100}%`, backgroundColor: seg.color }}
        />
      ))}
    </div>
  );
}
