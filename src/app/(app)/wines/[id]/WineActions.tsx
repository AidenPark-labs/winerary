"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Wine {
  id: string;
  name_ko: string;
  name_en: string | null;
  wine_type: string | null;
  country: string | null;
  grape_variety: string | null;
  vivino_url: string | null;
}

export default function WineActions({ wine }: { wine: Wine }) {
  const router = useRouter();
  const [wishSaving, setWishSaving] = useState(false);
  const [wishSaved, setWishSaved] = useState(false);

  async function handleWishlistAdd() {
    if (wishSaving || wishSaved) return;
    setWishSaving(true);
    try {
      await fetch("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name_ko: wine.name_ko,
          name_en: wine.name_en || wine.name_ko,
          wine_id: wine.id,
        }),
      });
      setWishSaved(true);
    } finally {
      setWishSaving(false);
    }
  }

  function handleRecord() {
    const p = new URLSearchParams();
    p.set("name", wine.name_ko);
    if (wine.name_en) p.set("name_original", wine.name_en);
    if (wine.wine_type) p.set("wine_type", wine.wine_type);
    if (wine.country) p.set("country", wine.country);
    if (wine.grape_variety) p.set("grape", wine.grape_variety);
    if (wine.id) p.set("wine_id", wine.id);
    router.push(`/diary/new?${p.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={handleWishlistAdd}
        disabled={wishSaving || wishSaved}
        className={`w-full py-3.5 rounded-2xl font-light text-sm transition-all shadow-lg active:scale-[0.98] ${
          wishSaved
            ? "bg-accent/20 border border-accent/40 text-accent/80"
            : "bg-surface/80 border border-white/10 text-zinc-200 hover:bg-white/5"
        }`}
      >
        {wishSaved ? "♥ 내 와인에 추가됨" : wishSaving ? "추가 중…" : "♡ 내 와인에 추가하기"}
      </button>
      <button
        onClick={handleRecord}
        className="w-full py-3.5 rounded-2xl bg-accent hover:bg-accent/90 active:scale-[0.98] transition-all text-white font-medium shadow-lg shadow-accent/20"
      >
        이 와인 기록하기
      </button>
    </div>
  );
}
