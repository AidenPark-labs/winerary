"use client";

import { useEffect, useState, useRef } from "react";

export default function VivinoRating({
  wineId,
  nameEn,
  initialRating,
  initialReviews,
}: {
  wineId: string;
  nameEn: string | null;
  initialRating: number | null;
  initialReviews: number | null;
}) {
  const [rating, setRating] = useState<number | null>(initialRating ? Number(initialRating) : null);
  const [reviews, setReviews] = useState<number | null>(initialReviews);
  const [vivinoName, setVivinoName] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialRating && !!nameEn);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current || rating || !nameEn) return;
    fetchedRef.current = true;

    fetch(`/api/vivino/rating?q=${encodeURIComponent(nameEn)}&wine_id=${wineId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.rating) {
          setRating(d.rating);
          setReviews(d.reviews);
          if (d.vivinoName) setVivinoName(d.vivinoName);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [nameEn, wineId, rating]);

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-purple-950/30 border border-purple-800/40">
        <div className="w-4 h-4 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
        <span className="text-purple-400/60 text-xs">Vivino 별점 확인 중</span>
      </div>
    );
  }

  if (!rating) return null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-purple-950/30 border border-purple-800/40">
        <span className="text-purple-300 font-bold text-lg">★ {rating.toFixed(1)}</span>
        {reviews && (
          <span className="text-purple-400/60 text-xs">({reviews.toLocaleString()})</span>
        )}
        <span className="text-purple-400/40 text-xs ml-0.5">Vivino</span>
      </div>
      {vivinoName && nameEn && vivinoName.toLowerCase() !== nameEn.toLowerCase() && (
        <p className="text-[11px] text-purple-400/50 px-1">Vivino 등록명: {vivinoName}</p>
      )}
    </div>
  );
}
