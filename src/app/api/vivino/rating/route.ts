import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const wineId = searchParams.get("wine_id")?.trim();
  if (!query) return Response.json({ rating: null });

  try {
    // 1단계: DuckDuckGo로 Vivino 와인 페이지 URL 찾기
    const vivinoUrl = await findVivinoWinePage(query);
    if (!vivinoUrl) return Response.json({ rating: null });

    // 2단계: Vivino 와인 페이지의 JSON-LD에서 정확한 별점 추출
    const result = await extractRatingFromJsonLd(vivinoUrl);
    if (result) {
      if (wineId) cacheRating(wineId, result.rating, result.reviews);
      return Response.json(result);
    }

    return Response.json({ rating: null });
  } catch {
    return Response.json({ rating: null });
  }
}

// DuckDuckGo HTML 검색으로 Vivino 와인 페이지 URL 찾기
async function findVivinoWinePage(query: string): Promise<string | null> {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=site:vivino.com+${encodeURIComponent(query)}+wine`;
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) return null;

    const html = await res.text();
    const match = html.match(/vivino\.com\/[^\s"&]*\/w\/\d+/);
    if (match) return "https://www." + match[0].split("&")[0];
  } catch {}

  // 폴백: 짧은 이름으로 재시도
  const short = query
    .replace(/\s+(Red|White|Rosé|Rose|Brut|Tinto|Blanco|Blanc|Rouge)\s*$/i, "")
    .replace(/\s+(Cabernet Sauvignon|Merlot|Shiraz|Chardonnay|Pinot Noir|Sauvignon Blanc)\s*$/i, "")
    .trim();

  if (short !== query && short.length >= 3) {
    try {
      const res = await fetch(`https://html.duckduckgo.com/html/?q=site:vivino.com+${encodeURIComponent(short)}+wine`, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
      });
      if (res.ok) {
        const html = await res.text();
        const match = html.match(/vivino\.com\/[^\s"&]*\/w\/\d+/);
        if (match) return "https://www." + match[0].split("&")[0];
      }
    } catch {}
  }

  return null;
}

// Vivino 와인 페이지의 JSON-LD에서 aggregateRating 추출
async function extractRatingFromJsonLd(url: string): Promise<{ rating: number; reviews: number } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) return null;

    const html = await res.text();
    const jsonldMatches = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)<\/script>/g)];

    for (const m of jsonldMatches) {
      try {
        const data = JSON.parse(m[1]);
        if (data.aggregateRating) {
          const rating = parseFloat(data.aggregateRating.ratingValue);
          const reviews = parseInt(data.aggregateRating.ratingCount);
          if (rating > 0 && reviews > 0) {
            return { rating, reviews };
          }
        }
      } catch {}
    }
  } catch {}
  return null;
}

// DB에 캐시 저장
async function cacheRating(wineId: string, rating: number, reviews: number) {
  try {
    const supabase = await createClient();
    await supabase
      .from("wines")
      .update({ vivino_rating: rating, vivino_reviews: reviews })
      .eq("id", wineId);
  } catch {}
}
