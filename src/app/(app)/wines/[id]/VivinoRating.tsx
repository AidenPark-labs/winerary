"use client";

import { useEffect, useState, useRef } from "react";

export default function VivinoRating({
  wineId,
  nameEn,
  initialRating,
  initialReviews,
  initialPageUrl,
}: {
  wineId: string;
  nameEn: string | null;
  initialRating: number | null;
  initialReviews: number | null;
  initialPageUrl: string | null;
}) {
  const [rating, setRating] = useState<number | null>(initialRating ? Number(initialRating) : null);
  const [reviews, setReviews] = useState<number | null>(initialReviews);
  const [pageUrl, setPageUrl] = useState<string | null>(initialPageUrl);
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
          if (d.vivinoPageUrl) setPageUrl(d.vivinoPageUrl);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [nameEn, wineId, rating]);

  const vivinoHref = pageUrl || (nameEn ? `https://www.vivino.com/search/wines?q=${encodeURIComponent(nameEn)}` : null);

  if (loading) {
    return (
      <div className="flex items-center justify-between px-5 py-2">
        <span className="text-xs text-zinc-400">Vivino</span>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
          <span className="text-xs text-zinc-500">확인 중</span>
        </div>
      </div>
    );
  }

  if (!rating && !vivinoHref) return null;

  return (
    <>
      {rating && (
        <>
          <div className="mx-5 my-1 border-t border-white/5" />
          <div className="flex items-center justify-between px-5 py-2">
            <span className="text-xs text-zinc-400">Vivino 별점</span>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-purple-300 font-bold">★ {rating.toFixed(1)}</span>
              {reviews && (
                <span className="text-xs text-zinc-500">({reviews.toLocaleString()})</span>
              )}
            </div>
          </div>
        </>
      )}
      {vivinoHref && (
        <div className="px-5 py-2">
          <a
            href={vivinoHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-sm hover:bg-purple-500/15 transition-colors"
          >
            비비노에서 보기
            <span className="text-purple-400/60 text-xs">→</span>
          </a>
        </div>
      )}
    </>
  );
}
