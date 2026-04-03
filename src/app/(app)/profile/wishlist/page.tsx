"use client";

import { useState, useEffect, useCallback } from "react";
import Toast from "@/components/Toast";

interface WishlistItem {
  id: string;
  name_ko: string;
  name_en: string;
  created_at: string;
}

export default function WishlistPage() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(false);

  useEffect(() => {
    fetch("/api/wishlist")
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await fetch("/api/wishlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setItems((prev) => prev.filter((w) => w.id !== id));
    setToast(true);
  }, []);

  return (
    <div className="flex flex-col min-h-screen">
      <Toast message="내 와인에서 삭제되었어요" visible={toast} onHide={() => setToast(false)} />

      <header className="px-5 pt-12 pb-4">
        <h1 className="text-2xl font-bold">내 와인</h1>
      </header>

      <div className="px-4 pb-28">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 rounded-full border-2 border-rose-600 border-t-transparent animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <span className="text-5xl">🍷</span>
            <p className="text-zinc-500 text-sm">저장된 와인이 없습니다</p>
            <a href="/recommend" className="text-rose-400 text-sm hover:underline">와인 추천받으러 가기 →</a>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-zinc-500 text-sm">{items.length}개의 와인이 저장되어 있어요</p>
            {items.map((item) => {
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
        )}
      </div>
    </div>
  );
}
