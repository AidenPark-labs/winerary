/**
 * Vivino 별점 크롤링 v2 (JSON-LD 방식)
 *
 * 1. DuckDuckGo로 Vivino 와인 페이지 URL 검색
 * 2. Vivino 페이지의 JSON-LD에서 정확한 별점 추출
 * 3. wine_id, page_url, rating, reviews를 DB에 저장
 *
 * 실행: npx tsx scripts/crawl-vivino-v2.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// DuckDuckGo로 Vivino 와인 페이지 URL 찾기
async function findVivinoUrl(query: string): Promise<string | null> {
  const searches = [
    query,
    query.replace(/\s+(Red|White|Rosé|Rose|Brut|Tinto|Blanco|Blanc|Rouge)\s*$/i, "").trim(),
  ];

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
        const url = "https://www." + match[0].split("&")[0];
        const wineId = parseInt(match[1]);
        return JSON.stringify({ url, wineId });
      }
    } catch {}
    await sleep(1500);
  }
  return null;
}

// Vivino 페이지 JSON-LD에서 별점 추출
async function extractFromJsonLd(url: string): Promise<{ rating: number; reviews: number; name: string } | null> {
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
          if (rating > 0 && reviews > 0) return { rating, reviews, name: d.name ?? "" };
        }
      } catch {}
    }
  } catch {}
  return null;
}

async function main() {
  console.log("🍇 Vivino 별점 크롤링 v2 시작 (JSON-LD 방식)\n");

  let offset = 0;
  let total = 0;
  let found = 0;
  const BATCH = 20;

  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/wines?select=id,name_ko,name_en&vivino_rating=is.null&name_en=not.is.null&order=id&offset=${offset}&limit=${BATCH}`,
      { headers }
    );
    const wines = await res.json();
    if (!Array.isArray(wines) || wines.length === 0) break;

    for (const wine of wines) {
      const query = wine.name_en || wine.name_ko;
      process.stdout.write(`  [${total + 1}] ${query.substring(0, 42).padEnd(42)} `);

      const urlData = await findVivinoUrl(query);
      if (urlData) {
        const { url, wineId } = JSON.parse(urlData);
        const result = await extractFromJsonLd(url);

        if (result) {
          await fetch(`${SUPABASE_URL}/rest/v1/wines?id=eq.${wine.id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              vivino_rating: result.rating,
              vivino_reviews: result.reviews,
              vivino_wine_id: wineId,
              vivino_page_url: url,
            }),
          });
          console.log(`★ ${result.rating} (${result.reviews.toLocaleString()}) [${wineId}]`);
          found++;
        } else {
          console.log(`- 페이지 있으나 별점 없음`);
        }
      } else {
        console.log(`- 검색 결과 없음`);
      }

      total++;
      await sleep(2000); // DuckDuckGo rate limit 방지
    }

    offset += BATCH;
  }

  console.log(`\n🎉 완료! ${total}개 와인 중 ${found}개의 Vivino 별점 수집`);
}

main().catch(console.error);
