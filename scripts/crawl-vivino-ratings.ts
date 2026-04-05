/**
 * Vivino 별점 크롤링 스크립트
 * 와인 DB의 영어 이름으로 Vivino를 검색하여 별점과 리뷰 수를 수집
 *
 * 실행: npx tsx scripts/crawl-vivino-ratings.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const headers = {
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

interface Wine {
  id: string;
  name_ko: string;
  name_en: string | null;
}

async function fetchWinesWithoutRating(offset: number, limit: number): Promise<Wine[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/wines?select=id,name_ko,name_en&vivino_rating=is.null&name_en=not.is.null&order=id&offset=${offset}&limit=${limit}`,
    { headers }
  );
  return res.json();
}

async function fetchVivinoRating(query: string): Promise<{ rating: number; reviews: number } | null> {
  try {
    const url = `https://www.vivino.com/search/wines?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) return null;

    const html = await res.text();
    const decoded = html.replace(/&quot;/g, '"').replace(/&amp;/g, "&");

    const ratings = [...decoded.matchAll(/"wine_ratings_average":([\d.]+)/g)];
    const counts = [...decoded.matchAll(/"wine_ratings_count":(\d+)/g)];

    if (ratings.length > 0 && counts.length > 0) {
      const rating = parseFloat(ratings[0][1]);
      const reviews = parseInt(counts[0][1]);
      // 리뷰 수가 일정 이상이어야 신뢰할 수 있음
      if (reviews >= 10 && rating > 0) {
        return { rating, reviews };
      }
    }
  } catch {
    // 크롤링 실패 무시
  }
  return null;
}

async function updateWineRating(id: string, rating: number, reviews: number) {
  await fetch(`${SUPABASE_URL}/rest/v1/wines?id=eq.${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ vivino_rating: rating, vivino_reviews: reviews }),
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("🍇 Vivino 별점 크롤링 시작\n");

  let offset = 0;
  let total = 0;
  let found = 0;
  const BATCH = 10;

  while (true) {
    const wines = await fetchWinesWithoutRating(offset, BATCH);
    if (wines.length === 0) break;

    for (const wine of wines) {
      const query = wine.name_en || wine.name_ko;
      process.stdout.write(`  [${total + 1}] ${query.substring(0, 40).padEnd(40)} `);

      const result = await fetchVivinoRating(query);
      if (result) {
        await updateWineRating(wine.id, result.rating, result.reviews);
        console.log(`★ ${result.rating} (${result.reviews.toLocaleString()})`);
        found++;
      } else {
        console.log(`- 없음`);
      }

      total++;
      // Vivino rate limit 방지 (1~2초 간격)
      await sleep(1500);
    }

    offset += BATCH;
  }

  console.log(`\n🎉 완료! ${total}개 와인 중 ${found}개의 Vivino 별점 수집`);
}

main().catch(console.error);
