import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const wineId = searchParams.get("wine_id")?.trim();
  if (!query) return Response.json({ rating: null });

  try {
    // Vivino 검색 페이지에서 별점 추출
    const url = `https://www.vivino.com/search/wines?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) return Response.json({ rating: null });

    const html = await res.text();
    const decoded = html.replace(/&quot;/g, '"').replace(/&amp;/g, "&");

    const ratings = [...decoded.matchAll(/"wine_ratings_average":([\d.]+)/g)].map(m => parseFloat(m[1]));
    const counts = [...decoded.matchAll(/"wine_ratings_count":(\d+)/g)].map(m => parseInt(m[1]));
    const wineNames = [...decoded.matchAll(/"name":"([^"]+)"[^}]*?"seo_name"/g)].map(m => m[1]);

    // 검색어 키워드와 매칭
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    for (let i = 0; i < Math.min(wineNames.length, ratings.length, counts.length); i++) {
      const name = wineNames[i].toLowerCase();
      const matchScore = queryWords.filter(w => name.includes(w)).length;
      if (matchScore >= Math.ceil(queryWords.length / 2) && ratings[i] > 0 && counts[i] >= 10) {
        const result = { rating: ratings[i], reviews: counts[i] };
        // DB에 캐시 저장
        if (wineId) cacheRating(wineId, result.rating, result.reviews);
        return Response.json(result);
      }
    }

    // 정확 매칭 실패 → 첫 결과 (리뷰 100건 이상)
    if (ratings.length > 0 && ratings[0] > 0 && counts[0] >= 100) {
      const result = { rating: ratings[0], reviews: counts[0] };
      if (wineId) cacheRating(wineId, result.rating, result.reviews);
      return Response.json(result);
    }

    // 짧은 이름으로 재시도 (Red, White 등 제거)
    const short = query
      .replace(/\s+(Red|White|Rosé|Rose|Brut|Tinto|Blanco|Blanc|Rouge)\s*$/i, "")
      .replace(/\s+(Cabernet Sauvignon|Merlot|Shiraz|Chardonnay|Pinot Noir|Sauvignon Blanc)\s*$/i, "")
      .trim();

    if (short !== query && short.length >= 3) {
      const res2 = await fetch(`https://www.vivino.com/search/wines?q=${encodeURIComponent(short)}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/537.36",
          "Accept": "text/html",
        },
      });

      if (res2.ok) {
        const html2 = await res2.text();
        const decoded2 = html2.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
        const r2 = [...decoded2.matchAll(/"wine_ratings_average":([\d.]+)/g)].map(m => parseFloat(m[1]));
        const c2 = [...decoded2.matchAll(/"wine_ratings_count":(\d+)/g)].map(m => parseInt(m[1]));

        if (r2.length > 0 && r2[0] > 0 && c2[0] >= 10) {
          const result = { rating: r2[0], reviews: c2[0] };
          if (wineId) cacheRating(wineId, result.rating, result.reviews);
          return Response.json(result);
        }
      }
    }

    return Response.json({ rating: null });
  } catch {
    return Response.json({ rating: null });
  }
}

// DB에 캐시 저장 (fire-and-forget)
async function cacheRating(wineId: string, rating: number, reviews: number) {
  try {
    const supabase = await createClient();
    await supabase
      .from("wines")
      .update({ vivino_rating: rating, vivino_reviews: reviews })
      .eq("id", wineId);
  } catch {}
}
