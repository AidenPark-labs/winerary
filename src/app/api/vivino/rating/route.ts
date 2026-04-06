import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const wineId = searchParams.get("wine_id")?.trim();
  if (!query) return Response.json({ rating: null });

  try {
    const supabase = await createClient();

    // 1단계: DB에 vivino_page_url이 이미 있으면 바로 사용
    if (wineId) {
      const { data: wine } = await supabase
        .from("wines")
        .select("vivino_page_url")
        .eq("id", wineId)
        .single();

      if (wine?.vivino_page_url) {
        const result = await extractRatingFromJsonLd(wine.vivino_page_url);
        if (result) {
          cacheRating(supabase, wineId, result.rating, result.reviews);
          return Response.json(result);
        }
      }
    }

    // 2단계: DuckDuckGo로 Vivino 와인 페이지 URL 찾기
    const found = await findVivinoWinePage(query);
    if (!found) return Response.json({ rating: null });

    // 3단계: Vivino 페이지 JSON-LD에서 별점 추출
    const result = await extractRatingFromJsonLd(found.url);
    if (result) {
      if (wineId) {
        cacheRating(supabase, wineId, result.rating, result.reviews, found.url, found.vivinoWineId);
      }
      return Response.json(result);
    }

    return Response.json({ rating: null });
  } catch {
    return Response.json({ rating: null });
  }
}

async function findVivinoWinePage(query: string): Promise<{ url: string; vivinoWineId: number } | null> {
  const searches = [
    query,
    query.replace(/\s+(Red|White|Rosé|Rose|Brut|Tinto|Blanco|Blanc|Rouge)\s*$/i, "").trim(),
  ];

  // DuckDuckGo 검색
  for (const q of searches) {
    if (q.length < 3) continue;
    try {
      const res = await fetch(
        `https://html.duckduckgo.com/html/?q=site:vivino.com+${encodeURIComponent(q)}+wine`,
        { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" } }
      );
      if (!res.ok) continue;
      const html = await res.text();
      const match = html.match(/vivino\.com\/[^\s"&]*\/w\/(\d+)/);
      if (match) {
        return {
          url: "https://www." + match[0].split("&")[0],
          vivinoWineId: parseInt(match[1]),
        };
      }
    } catch {}
  }

  // 폴백: Vivino 검색 페이지 접근 → JSON-LD가 있는 와인 페이지 리다이렉트 확인
  try {
    const vivinoSearch = `https://www.vivino.com/search/wines?q=${encodeURIComponent(searches[0])}`;
    const res = await fetch(vivinoSearch, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
    });
    if (res.ok) {
      const html = await res.text();
      // JSON-LD가 있으면 직접 추출 시도
      const jsonld = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)<\/script>/g)];
      for (const m of jsonld) {
        try {
          const d = JSON.parse(m[1]);
          if (d.aggregateRating && d.url) {
            const idMatch = d.url.match(/\/w\/(\d+)/);
            if (idMatch) return { url: d.url, vivinoWineId: parseInt(idMatch[1]) };
          }
        } catch {}
      }
    }
  } catch {}

  return null;
}

async function extractRatingFromJsonLd(url: string): Promise<{ rating: number; reviews: number } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const matches = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)<\/script>/g)];
    for (const m of matches) {
      try {
        const d = JSON.parse(m[1]);
        if (d.aggregateRating) {
          const rating = parseFloat(d.aggregateRating.ratingValue);
          const reviews = parseInt(d.aggregateRating.ratingCount);
          if (rating > 0 && reviews > 0) return { rating, reviews };
        }
      } catch {}
    }
  } catch {}
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cacheRating(supabase: any, wineId: string, rating: number, reviews: number, pageUrl?: string, vivinoWineId?: number) {
  try {
    const update: Record<string, unknown> = { vivino_rating: rating, vivino_reviews: reviews };
    if (pageUrl) update.vivino_page_url = pageUrl;
    if (vivinoWineId) update.vivino_wine_id = vivinoWineId;
    await supabase.from("wines").update(update).eq("id", wineId);
  } catch {}
}
