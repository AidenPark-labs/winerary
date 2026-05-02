import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const wineId = searchParams.get("wine_id")?.trim();
  if (!query) return Response.json({ rating: null });

  try {
    const supabase = await createClient();

    // 1단계: vivino_wines에 url이 이미 있으면 바로 사용 (v5)
    if (wineId) {
      const { data: vivino } = await supabase
        .from("vivino_wines")
        .select("vivino_url")
        .eq("wine_id", wineId)
        .maybeSingle();

      if (vivino?.vivino_url) {
        const result = await extractRatingFromJsonLd(vivino.vivino_url);
        if (result) {
          cacheRating(supabase, wineId, result.rating, result.reviews, undefined, undefined, result.vivinoName);
          return Response.json({ ...result, vivinoPageUrl: vivino.vivino_url });
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
        cacheRating(supabase, wineId, result.rating, result.reviews, found.url, found.vivinoWineId, result.vivinoName);
      }
      return Response.json({ ...result, vivinoPageUrl: found.url });
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

async function extractRatingFromJsonLd(url: string): Promise<{ rating: number; reviews: number; vivinoName?: string } | null> {
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
          if (rating > 0 && reviews > 0) return { rating, reviews, vivinoName: d.name };
        }
      } catch {}
    }
  } catch {}
  return null;
}

// v5: vivino_wines UPSERT (wine_id PK 기준)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cacheRating(supabase: any, wineId: string, rating: number, reviews: number, pageUrl?: string, vivinoWineId?: number, vivinoName?: string) {
  try {
    // 기존 행 있으면 메트릭만 갱신, 없으면 신규 INSERT
    const { data: existing } = await supabase
      .from("vivino_wines")
      .select("wine_id")
      .eq("wine_id", wineId)
      .maybeSingle();

    if (existing) {
      const update: Record<string, unknown> = { rating, reviews };
      if (pageUrl) update.vivino_url = pageUrl;
      if (vivinoWineId) update.vivino_wine_id = String(vivinoWineId);
      if (vivinoName) update.vivino_name = vivinoName;
      await supabase.from("vivino_wines").update(update).eq("wine_id", wineId);
    } else if (pageUrl && /vivino\.com/i.test(pageUrl)) {
      // 신규: vivino_url 필수 (NOT NULL UNIQUE)
      await supabase.from("vivino_wines").insert({
        wine_id: wineId,
        vivino_url: pageUrl,
        vivino_wine_id: vivinoWineId ? String(vivinoWineId) : null,
        vivino_name: vivinoName ?? null,
        rating,
        reviews,
        // 캐시 경로라 자동 검수 통과 (이미 사용자에게 노출되는 url 기반)
        needs_review: false,
        reviewed_at: new Date().toISOString(),
      });
    }
  } catch {}
}

// Vivino 페이지에서 원본 와인명도 추출하여 DB 교정
async function correctOriginalName(url: string): Promise<string | null> {
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
        if (d["@type"] === "Product" && d.name) return d.name;
      } catch {}
    }
  } catch {}
  return null;
}
