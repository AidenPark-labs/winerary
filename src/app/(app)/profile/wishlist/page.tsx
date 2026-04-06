"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Toast from "@/components/Toast";
import AuthPrompt from "@/components/AuthPrompt";
import { Wine } from "lucide-react";

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
  const [needsAuth, setNeedsAuth] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setNeedsAuth(true);
        setLoading(false);
        return;
      }
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
      <div className="mx-5 mb-4 flex p-1 rounded-xl bg-surface border border-white/5 backdrop-blur-md">
        {([["frequent", "자주마신 와인"], ["wishlist", "위시리스트"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === key
                ? "bg-white/10 text-white shadow-sm"
                : "text-zinc-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {needsAuth && <AuthPrompt message="저장한 와인과 자주 마신 와인을 확인하려면 로그인이 필요합니다" />}

      <div className="px-4 pb-28">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 rounded-full border-2 border-rose-600 border-t-transparent animate-spin" />
          </div>
        ) : tab === "frequent" ? (
          /* 자주마신 와인 */
          frequentWines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Wine className="w-16 h-16 text-zinc-800" strokeWidth={1} />
              <p className="text-zinc-500 text-sm font-light">같은 와인을 2번 이상 기록하면 여기에 표시돼요</p>
              <a href="/diary/new" className="text-accent text-sm hover:underline font-light mt-1">와인 기록하러 가기 →</a>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-zinc-500 text-sm font-light">{frequentWines.length}종의 와인을 반복해서 즐겼어요</p>
              {frequentWines.map((wine, i) => (
                <div key={wine.name} className="p-4 rounded-2xl bg-surface/80 border border-white/5 backdrop-blur-md shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-sm font-bold text-accent flex-shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white truncate">{wine.name}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-500 font-light">
                        <span className="text-accent font-semibold">{wine.count}회</span>
                        {wine.wineType && <span>{TYPE_LABELS[wine.wineType] ?? wine.wineType}</span>}
                        {wine.avgRating != null && (
                          <span className="flex items-center gap-0.5 text-amber-400 font-medium">
                            ★ {wine.avgRating.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-600 mt-1 font-light">
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
              <Wine className="w-16 h-16 text-zinc-800" strokeWidth={1} />
              <p className="text-zinc-500 text-sm font-light">저장된 와인이 없습니다</p>
              <a href="/recommend" className="text-accent text-sm hover:underline font-light mt-1">와인 추천받으러 가기 →</a>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-zinc-500 text-sm font-light">{wishlistItems.length}개의 와인이 저장되어 있어요</p>
              {wishlistItems.map((item) => {
                const vivinoUrl = `https://www.vivino.com/search/wines?q=${encodeURIComponent(item.name_en)}`;
                const naverUrl = `https://msearch.shopping.naver.com/search/all?query=${encodeURIComponent(item.name_ko)}`;
                return (
                  <div key={item.id} className="p-4 rounded-2xl bg-surface/80 border border-white/5 backdrop-blur-md shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-white truncate">{item.name_ko}</p>
                        <p className="text-xs text-zinc-500 mt-0.5 truncate">{item.name_en}</p>
                      </div>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-xs px-2.5 py-1 rounded-full border border-white/10 text-zinc-500 hover:text-accent hover:border-accent hover:bg-accent/10 transition-colors flex-shrink-0"
                      >
                        삭제
                      </button>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <a href={vivinoUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-accent text-xs hover:bg-white/10 transition-colors tracking-wide">
                        Vivino
                      </a>
                      <a href={naverUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-zinc-300 text-xs hover:bg-white/10 transition-colors tracking-wide">
                        네이버 최저가
                      </a>
                    </div>
                    <p className="text-xs text-zinc-600 mt-2 font-light">
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
