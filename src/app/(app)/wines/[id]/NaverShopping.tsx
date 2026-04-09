"use client";

import { useEffect, useState, useRef } from "react";

interface ShoppingItem {
  title: string;
  link: string;
  image: string;
  lprice: number | null;
  mallName: string;
}

export default function NaverShopping({ query, wineId }: { query: string; wineId?: string }) {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    fetch(`/api/naver/shopping?q=${encodeURIComponent(query)}${wineId ? `&wine_id=${wineId}` : ""}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.items) setItems(d.items);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [query]);

  if (loading) {
    return (
      <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 overflow-hidden shadow-2xl">
        <div className="px-5 pt-4 pb-2">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">Naver Shopping</p>
        </div>
        <div className="px-5 pb-4 flex items-center gap-2">
          <div className="w-4 h-4 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
          <span className="text-xs text-zinc-500">검색 중...</span>
        </div>
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="rounded-[20px] bg-black/30 backdrop-blur-xl border border-white/15 overflow-hidden shadow-2xl">
      <div className="px-5 pt-4 pb-2">
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">Naver Shopping</p>
      </div>
      <div className="px-4 pb-4 flex flex-col gap-2">
        {items.map((item, i) => (
          <a
            key={i}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] transition-colors"
          >
            {item.image && (
              <img src={item.image} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-zinc-700" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-zinc-200 truncate">{item.title}</p>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500">
                {item.lprice && (
                  <span className="text-emerald-400">{item.lprice.toLocaleString()}원</span>
                )}
                {item.mallName && <span>{item.mallName}</span>}
              </div>
            </div>
            <span className="text-zinc-600 text-xs flex-shrink-0">→</span>
          </a>
        ))}
      </div>
    </div>
  );
}
