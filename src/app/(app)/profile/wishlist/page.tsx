"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Toast from "@/components/Toast";
import AuthPrompt from "@/components/AuthPrompt";
import { Wine, Trash2 } from "lucide-react";
import Link from "next/link";
import { getWineImage } from "@/lib/wine-placeholder";

interface WineDetail {
  id: string;
  name_ko: string;
  name_en: string | null;
  wine_type: string | null;
  country: string | null;
  grape_variety: string | null;
  naver_image: string | null;
  vivino_rating: number | null;
  vivino_reviews: number | null;
  price: number | null;
  final_grapes: string | null;
  vivino_grapes: string | null;
  final_country: string | null;
  final_wine_type: string | null;
}

interface WishlistItem {
  id: string;
  name_ko: string;
  name_en: string;
  wine_id: string | null;
  created_at: string;
  wine: WineDetail | null;
}

const TYPE_KO: Record<string, string> = {
  red: "레드", white: "화이트", rose: "로제",
  sparkling: "스파클링", fortified: "주정강화", dessert: "디저트", other: "기타",
};

export default function MyWinePage() {
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

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
      const res = await fetch("/api/wishlist");
      const d = await res.json();
      setWishlistItems(d.items ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const handleDeleteClick = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmId(id);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!confirmId) return;
    await fetch("/api/wishlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: confirmId }),
    });
    setWishlistItems((prev) => prev.filter((w) => w.id !== confirmId));
    setConfirmId(null);
    setToast(true);
  }, [confirmId]);

  function resolveDisplay(item: WishlistItem) {
    const w = item.wine;
    if (!w) return { type: null, country: null, grapes: null, image: getWineImage(null, null), rating: null, reviews: null, price: null };
    return {
      type: w.final_wine_type ?? w.wine_type,
      country: w.final_country ?? w.country,
      grapes: w.final_grapes ?? w.vivino_grapes ?? w.grape_variety,
      image: getWineImage(w.naver_image, w.wine_type),
      rating: w.vivino_rating,
      reviews: w.vivino_reviews,
      price: w.price,
    };
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Toast message="위시리스트에서 삭제되었어요" visible={toast} onHide={() => setToast(false)} />

      {/* 삭제 확인 다이얼로그 */}
      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfirmId(null)}>
          <div className="mx-6 w-full max-w-xs rounded-2xl bg-zinc-900 border border-white/10 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-white font-medium text-center">위시리스트에서 삭제할까요?</p>
            <p className="text-zinc-500 text-sm text-center mt-1">이 와인이 내 와인 목록에서 제거됩니다.</p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setConfirmId(null)} className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-zinc-400 text-sm transition-colors hover:bg-white/10">
                취소
              </button>
              <button onClick={handleDeleteConfirm} className="flex-1 py-2.5 rounded-xl bg-accent/90 text-white text-sm font-medium transition-colors hover:bg-accent">
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="px-5 pt-12 pb-4">
        <h1 className="text-2xl font-bold">내 와인</h1>
        {!loading && !needsAuth && wishlistItems.length > 0 && (
          <p className="text-zinc-500 text-sm font-light mt-1">{wishlistItems.length}개의 와인이 저장되어 있어요</p>
        )}
      </header>

      {needsAuth && <AuthPrompt message="저장한 와인을 확인하려면 로그인이 필요합니다" />}

      <div className="px-4 pb-28">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 rounded-full border-2 border-rose-600 border-t-transparent animate-spin" />
          </div>
        ) : wishlistItems.length === 0 && !needsAuth ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Wine className="w-16 h-16 text-zinc-800" strokeWidth={1} />
            <p className="text-zinc-500 text-sm font-light">저장된 와인이 없습니다</p>
            <p className="text-zinc-600 text-xs font-light">와인 상세 페이지에서 ♡ 버튼을 눌러 추가해보세요</p>
            <Link href="/recommend" className="text-accent text-sm hover:underline font-light mt-2">와인 추천받으러 가기 →</Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {wishlistItems.map((item) => {
              const d = resolveDisplay(item);
              const hasDetail = !!item.wine_id;
              const savedDate = new Date(item.created_at).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });

              const cardContent = (
                <div className="flex gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] transition-colors">
                  {/* 와인 이미지 */}
                  <img src={d.image} alt={item.name_ko} className="w-12 h-16 rounded-lg object-cover flex-shrink-0 bg-zinc-700" />

                  {/* 와인 정보 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[15px] text-zinc-200 font-medium leading-snug line-clamp-2">{item.name_ko}</p>
                      <button
                        onClick={(e) => handleDeleteClick(e, item.id)}
                        className="p-1 rounded-md text-zinc-700 hover:text-accent hover:bg-accent/10 transition-colors flex-shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1 text-xs text-zinc-500">
                      {d.type && <span className="text-zinc-400">{TYPE_KO[d.type] ?? d.type}</span>}
                      {d.type && d.country && <span className="text-zinc-700">·</span>}
                      {d.country && <span>{d.country}</span>}
                      {d.price && <><span className="text-zinc-700">·</span><span className="text-emerald-400">{d.price.toLocaleString()}원</span></>}
                      {d.rating && <><span className="text-zinc-700">·</span><span className="text-rose-300">★ {Number(d.rating).toFixed(1)}</span></>}
                    </div>
                    {d.grapes && (
                      <p className="text-[11px] text-zinc-600 mt-1 truncate">{d.grapes}</p>
                    )}
                    <p className="text-[10px] text-zinc-700 mt-1">{savedDate} 저장</p>
                  </div>
                </div>
              );

              if (hasDetail) {
                return (
                  <Link key={item.id} href={`/wines/${item.wine_id}`} className="block active:scale-[0.98] transition-transform">
                    {cardContent}
                  </Link>
                );
              }

              return <div key={item.id}>{cardContent}</div>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
