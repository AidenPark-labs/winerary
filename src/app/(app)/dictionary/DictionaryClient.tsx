"use client";

import { useState, useTransition, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Filter, BookOpen } from "lucide-react";
import { getWineImage } from "@/lib/wine-placeholder";
import type { DictionaryOptions, DictionaryWine } from "./page";

const TYPE_KO: Record<string, string> = {
  red: "레드",
  white: "화이트",
  rose: "로제",
  sparkling: "스파클링",
  fortified: "주정강화",
  dessert: "디저트",
  other: "기타",
};

const TYPES = [
  { value: "all", label: "전체" },
  { value: "red", label: "레드" },
  { value: "white", label: "화이트" },
  { value: "sparkling", label: "스파클링" },
  { value: "rose", label: "로제" },
  { value: "dessert", label: "디저트" },
  { value: "fortified", label: "주정강화" },
];

interface Props {
  initial: { q: string; type: string; country: string; grape: string; k: number };
  options: DictionaryOptions;
  results: DictionaryWine[];
}

export default function DictionaryClient({ initial, options, results }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useState(initial.q);
  const [type, setType] = useState(initial.type);
  const [country, setCountry] = useState(initial.country);
  const [grape, setGrape] = useState(initial.grape);
  const [showAllGrapes, setShowAllGrapes] = useState(false);
  const [showAllCountries, setShowAllCountries] = useState(false);

  const pushParams = (overrides: Partial<{ q: string; type: string; country: string; grape: string; k: number }>) => {
    const next = {
      q: overrides.q !== undefined ? overrides.q : q,
      type: overrides.type !== undefined ? overrides.type : type,
      country: overrides.country !== undefined ? overrides.country : country,
      grape: overrides.grape !== undefined ? overrides.grape : grape,
      k: overrides.k !== undefined ? overrides.k : initial.k,
    };
    const sp = new URLSearchParams();
    if (next.q.trim()) sp.set("q", next.q.trim());
    if (next.type && next.type !== "all") sp.set("type", next.type);
    if (next.country) sp.set("country", next.country);
    if (next.grape) sp.set("grape", next.grape);
    if (next.k && next.k !== 50) sp.set("k", String(next.k));
    const qs = sp.toString();
    startTransition(() => router.push(qs ? `/dictionary?${qs}` : "/dictionary"));
  };

  // 타입 변경 시 품종 초기화 (타입 의존 품종 필터)
  const handleTypeChange = (newType: string) => {
    setType(newType);
    setGrape("");
    pushParams({ type: newType, grape: "" });
  };

  const handleCountry = (c: string) => {
    const next = country === c ? "" : c;
    setCountry(next);
    pushParams({ country: next });
  };

  const handleGrape = (g: string) => {
    const next = grape === g ? "" : g;
    setGrape(next);
    pushParams({ grape: next });
  };

  const submitSearch = () => pushParams({ q });
  const clearAll = () => {
    setQ(""); setType("all"); setCountry(""); setGrape("");
    startTransition(() => router.push("/dictionary"));
  };

  const hasAnyFilter = type !== "all" || country || grape || q.trim();

  // 0건 제외 + 상위 N개 "더 보기" 토글
  const topN = 6;
  const grapes = useMemo(() => options.grapes.filter((g) => g.count > 0), [options.grapes]);
  const countries = useMemo(() => options.countries.filter((c) => c.count > 0), [options.countries]);
  const grapesToShow = useMemo(
    () => (showAllGrapes ? grapes : grapes.slice(0, topN)),
    [grapes, showAllGrapes]
  );
  const countriesToShow = useMemo(
    () => (showAllCountries ? countries : countries.slice(0, topN)),
    [countries, showAllCountries]
  );

  return (
    <div className="flex flex-col pb-28">
      <header className="sticky top-0 z-30 px-5 pt-8 pb-3 bg-background">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-accent" /> 와인 사전
            </h1>
            <p className="text-zinc-500 text-sm mt-1 font-light">타입·품종·국가로 와인을 둘러보세요</p>
          </div>
          {hasAnyFilter && (
            <button onClick={clearAll} className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1">
              초기화
            </button>
          )}
        </div>
      </header>

      <div className="px-4 flex flex-col gap-4">
        {/* 검색 입력 */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitSearch()}
              placeholder="와인명·품종·지역 검색 (선택)"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-zinc-100 text-sm focus:outline-none focus:border-accent focus:bg-black/60 transition-all font-light"
            />
          </div>
          <button
            onClick={submitSearch}
            disabled={isPending}
            className="px-4 py-2.5 rounded-xl bg-accent hover:bg-accent/90 disabled:opacity-40 text-white font-medium text-sm transition-all active:scale-[0.98]"
          >
            검색
          </button>
        </div>

        {/* 타입 필터 */}
        <section className="flex flex-col gap-1.5">
          <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">타입</p>
          <div className="flex flex-wrap gap-1.5">
            {TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => handleTypeChange(t.value)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  type === t.value
                    ? "bg-accent text-white border-accent"
                    : "bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </section>

        {/* 국가 필터 */}
        {countries.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">국가</p>
            <div className="flex flex-wrap gap-1.5">
              {countriesToShow.map((c) => (
                <button
                  key={c.value}
                  onClick={() => handleCountry(c.value)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    country === c.value
                      ? "bg-accent text-white border-accent"
                      : "bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10"
                  }`}
                >
                  {c.value}
                </button>
              ))}
              {countries.length > topN && (
                <button
                  onClick={() => setShowAllCountries((v) => !v)}
                  className="text-xs px-3 py-1.5 rounded-full border border-white/10 text-zinc-400 hover:bg-white/10"
                >
                  {showAllCountries ? "접기" : `+${countries.length - topN}`}
                </button>
              )}
            </div>
          </section>
        )}

        {/* 품종 필터 (타입 의존) */}
        {grapes.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">
              품종 {type !== "all" && <span className="text-zinc-600 normal-case">({TYPE_KO[type] ?? type} 기준)</span>}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {grapesToShow.map((g) => (
                <button
                  key={g.value}
                  onClick={() => handleGrape(g.value)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    grape === g.value
                      ? "bg-accent text-white border-accent"
                      : "bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10"
                  }`}
                >
                  {g.value}
                </button>
              ))}
              {grapes.length > topN && (
                <button
                  onClick={() => setShowAllGrapes((v) => !v)}
                  className="text-xs px-3 py-1.5 rounded-full border border-white/10 text-zinc-400 hover:bg-white/10"
                >
                  {showAllGrapes ? "접기" : `+${grapes.length - topN}`}
                </button>
              )}
            </div>
          </section>
        )}

        {/* 결과 */}
        <section className="flex flex-col gap-2 mt-2">
          <div className="flex items-center justify-between">
            <p className="text-zinc-500 text-sm flex items-center gap-2">
              <Filter className="w-3.5 h-3.5" />
              <span>
                {isPending ? "불러오는 중…" : `${results.length}개${results.length >= initial.k ? "+" : ""} 와인`}
              </span>
            </p>
          </div>

          {!isPending && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
              <BookOpen className="w-12 h-12 text-zinc-700" strokeWidth={1} />
              <p className="text-zinc-500 text-sm font-light">조건에 맞는 와인이 없어요</p>
              <p className="text-zinc-600 text-xs font-light">필터를 바꿔보세요</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="flex flex-col gap-2">
              {results.map((w) => (
                <Link
                  key={w.id}
                  href={`/wines/${w.id}`}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-surface/80 border border-white/5 hover:border-white/20 transition-all backdrop-blur-sm"
                >
                  <img
                    src={getWineImage(w.image_url, w.wine_type)}
                    alt=""
                    className="w-14 h-14 rounded-lg object-cover flex-shrink-0 bg-white/5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white text-sm truncate">{w.name_ko}</p>
                    {w.name_en && w.name_en !== w.name_ko && (
                      <p className="text-xs text-zinc-500 mt-0.5 truncate italic">{w.name_en}</p>
                    )}
                    <div className="flex items-center gap-2.5 mt-1.5 text-xs text-zinc-400 flex-wrap">
                      {w.vivino_rating != null && (
                        <span className="text-purple-300">★ {w.vivino_rating.toFixed(1)}</span>
                      )}
                      {w.wine_type && <span>{TYPE_KO[w.wine_type] ?? w.wine_type}</span>}
                      {w.country_display && <span>{w.country_display}</span>}
                      {w.grape_varieties_display && w.grape_varieties_display.length > 0 && (
                        <span className="text-zinc-500 truncate">
                          🍇 {w.grape_varieties_display.slice(0, 2).join(", ")}
                          {w.grape_varieties_display.length > 2 ? " 외" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}

              {results.length >= initial.k && (
                <button
                  onClick={() => pushParams({ k: Math.min(initial.k + 50, 200) })}
                  disabled={isPending || initial.k >= 200}
                  className="mt-2 py-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 text-sm font-light transition-all disabled:opacity-40"
                >
                  {initial.k >= 200 ? "최대 결과 표시됨 — 필터로 좁혀주세요" : "더 보기"}
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
