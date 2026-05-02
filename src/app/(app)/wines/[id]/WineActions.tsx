"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AuthPrompt from "@/components/AuthPrompt";
import ReportWineModal from "./ReportWineModal";

interface WineActionsInput {
  id: string;
  name_ko: string;
  name_en: string | null;
  wine_type: string | null;
  country_ko: string | null;
  grape_varieties: string[];
}

export default function WineActions({ wine, isLoggedIn }: { wine: WineActionsInput; isLoggedIn: boolean }) {
  const router = useRouter();
  const [wishSaving, setWishSaving] = useState(false);
  const [wishSaved, setWishSaved] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);

  useEffect(() => {
    fetch(`/api/wishlist/check?wine_id=${wine.id}`)
      .then((r) => r.json())
      .then((d) => { if (d.exists) setWishSaved(true); })
      .catch(() => {});
  }, [wine.id]);

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
    if (wine.country_ko) p.set("country", wine.country_ko);
    if (wine.grape_varieties.length > 0) p.set("grape", wine.grape_varieties.join(", "));
    if (wine.id) p.set("wine_id", wine.id);
    router.push(`/diary/new?${p.toString()}`);
  }

  function handleReportClick() {
    if (!isLoggedIn) {
      setShowAuthPrompt(true);
      return;
    }
    setShowReport(true);
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
        {wishSaved ? "♥ 내 와인에 저장중" : wishSaving ? "추가 중…" : "♡ 내 와인에 추가하기"}
      </button>
      <button
        onClick={handleRecord}
        className="w-full py-3.5 rounded-2xl bg-accent hover:bg-accent/90 active:scale-[0.98] transition-all text-white font-medium shadow-lg shadow-accent/20"
      >
        이 와인 기록하기
      </button>

      <button
        onClick={handleReportClick}
        className="w-full py-2 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors underline-offset-2 hover:underline"
      >
        🚩 와인 정보가 잘못됐어요
      </button>

      {showReport && (
        <ReportWineModal wineId={wine.id} onClose={() => setShowReport(false)} />
      )}
      {showAuthPrompt && (
        <AuthPrompt
          message="오류 신고는 로그인 후 이용할 수 있어요"
          returnUrl={`/wines/${wine.id}`}
        />
      )}
    </div>
  );
}
