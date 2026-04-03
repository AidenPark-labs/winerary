"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Toast from "@/components/Toast";

interface WishlistItem {
  id: string;
  name_ko: string;
  name_en: string;
  created_at: string;
}

interface FrequentWine {
  name: string;
  count: number;
  avgRating: number | null;
  wineType: string | null;
  lastDrunkAt: string;
}

export default function MyWinePage() {
  const [tab, setTab] = useState<"frequent" | "wishlist">("frequent");
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [frequentWines, setFrequentWines] = useState<FrequentWine[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      await Promise.all([loadFrequent(), loadWishlist()]);
      setLoading(false);
    }
    load();
  }, []);

  async function loadFrequent() {
    const supabase = createClient();
    const { data } = await supabase
      .from("wine_records")
      .select("name, rating, wine_type, drunk_at")
      .is("deleted_at", null)
      .order("drunk_at", { ascending: false });

    if (!data) return;

    const grouped: Record<string, { count: number; ratings: number[]; wineType: string | null; lastDrunkAt: string }> = {};
    data.forEach((r) => {
      const key = r.name;
      if (!grouped[key]) {
        grouped[key] = { count: 0, ratings: [], wineType: r.wine_type, lastDrunkAt: r.drunk_at };
      }
      grouped[key].count++;
      if (r.rating != null) grouped[key].ratings.push(r.rating);
    });

    const sorted = Object.entries(grouped)
      .filter(([, v]) => v.count >= 2)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([name, v]) => ({
        name,
        count: v.count,
        avgRating: v.ratings.length ? v.ratings.reduce((a, b) => a + b, 0) / v.ratings.length : null,
        wineType: v.wineType,
        lastDrunkAt: v.lastDrunkAt,
      }));

    setFrequentWines(sorted);
  }

  async function loadWishlist() {
    const res = await fetch("/api/wishlist");
    const d = await res.json();
    setWishlistItems(d.items ?? []);
  }

  const handleDelete = useCallback(async (id: string) => {
    await fetch("/api/wishlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setWishlistItems((prev) => prev.filter((w) => w.id !== id));
    setToast(true);
  }, []);

  const TYPE_LABELS: Record<string, string> = {
    red: "레드", white: "화이트", rose: "로제",
    sparkling: "스파클링", fortified: "주정강화", other: "기타",
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Toast message="위시리스트에서 삭제되었어요" visible={toast} onHide={() => setToast(false)} />

      <header className="px-5 pt-12 pb-2">
        <h1 className="text-2xl font-bold">내 와인</h1>
      </header>

      {/* Segmented Control */}
      <div className="mx-5 mb-4 flex p-1 rounded-xl bg-zinc-900 border border-zinc-800">
        {([["frequent", "자주마신 와인"], ["wishlist", "위시리스트"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === key
                ? "bg-zinc-700 text-white shadow-sm"
                : "text-zinc-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="px-4 pb-28">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 rounded-full border-2 border-rose-600 border-t-transparent animate-spin" />
          </div>
        ) : tab === "frequent" ? (
          /* 자주마신 와인 */
          frequentWines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <span className="text-5xl">🍷</span>
              <p className="text-zinc-500 text-sm">같은 와인을 2번 이상 기록하면 여기에 표시돼요</p>
              <a href="/diary/new" className="text-rose-400 text-sm hover:underline">와인 기록하러 가기 →</a>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-zinc-500 text-sm">{frequentWines.length}종의 와인을 반복해서 즐겼어요</p>
              {frequentWines.map((wine, i) => (
                <div key={wine.name} className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-rose-900/60 flex items-center justify-center text-sm font-bold text-rose-300 flex-shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white truncate">{wine.name}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-500">
                        <span className="text-rose-400 font-semibold">{wine.count}회</span>
                        {wine.wineType && <span>{TYPE_LABELS[wine.wineType] ?? wine.wineType}</span>}
                        {wine.avgRating != null && (
                          <span className="flex items-center gap-0.5 text-amber-400">
                            ★ {wine.avgRating.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-600 mt-1">
                        마지막: {new Date(wine.lastDrunkAt).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          /* 위시리스트 */
          wishlistItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <span className="text-5xl">🍷</span>
              <p className="text-zinc-500 text-sm">저장된 와인이 없습니다</p>
              <a href="/recommend" className="text-rose-400 text-sm hover:underline">와인 추천받으러 가기 →</a>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-zinc-500 text-sm">{wishlistItems.length}개의 와인이 저장되어 있어요</p>
              {wishlistItems.map((item) => {
                const vivinoUrl = `https://www.vivino.com/search/wines?q=${encodeURIComponent(item.name_en)}`;
                const naverUrl = `https://msearch.shopping.naver.com/search/all?query=${encodeURIComponent(item.name_ko)}`;
                return (
                  <div key={item.id} className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-white">{item.name_ko}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">{item.name_en}</p>
                      </div>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-xs px-2.5 py-1 rounded-full border border-zinc-700 text-zinc-500 hover:text-rose-400 hover:border-rose-700 transition-colors flex-shrink-0"
                      >
                        삭제
                      </button>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <a href={vivinoUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-rose-950/50 border border-rose-800/50 text-rose-300 text-xs hover:bg-rose-900/50 transition-colors">
                        Vivino
                      </a>
                      <a href={naverUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-950/50 border border-emerald-800/50 text-emerald-300 text-xs hover:bg-emerald-900/50 transition-colors">
                        네이버 최저가
                      </a>
                    </div>
                    <p className="text-xs text-zinc-600 mt-2">
                      {new Date(item.created_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })} 저장
                    </p>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
