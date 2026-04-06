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
    `${SUPABASE_URL}/rest/v1/wines?select=id,name_ko,name_en&vivino_rating=is.null&order=id&offset=${offset}&limit=${limit}`,
    { headers }
  );
  return res.json();
}

// 와인명에서 타입 접미사 제거 (Red, White, Rosé 등)
function shortenName(name: string): string {
  return name
    .replace(/\s+(Red|White|Rosé|Rose|Brut|Tinto|Blanco|Rosado|Blanc|Rouge)\s*$/i, "")
    .replace(/\s+(Cabernet Sauvignon|Merlot|Shiraz|Chardonnay|Pinot Noir|Sauvignon Blanc|Riesling)\s*$/i, "")
    .trim();
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

    const ratings = [...decoded.matchAll(/"wine_ratings_average":([\d.]+)/g)].map(m => parseFloat(m[1]));
    const counts = [...decoded.matchAll(/"wine_ratings_count":(\d+)/g)].map(m => parseInt(m[1]));
    const wineNames = [...decoded.matchAll(/"name":"([^"]+)"[^}]*?"seo_name"/g)].map(m => m[1]);

    // 검색어 키워드와 일치하는 와인 찾기
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    for (let i = 0; i < Math.min(wineNames.length, ratings.length, counts.length); i++) {
      const name = wineNames[i].toLowerCase();
      const matchScore = queryWords.filter(w => name.includes(w)).length;
      if (matchScore >= Math.ceil(queryWords.length / 2) && ratings[i] > 0 && counts[i] >= 10) {
        return { rating: ratings[i], reviews: counts[i] };
      }
    }

    // 정확 매칭 실패 시 첫 결과가 충분히 신뢰할 만하면 사용
    if (ratings.length > 0 && counts.length > 0 && ratings[0] > 0 && counts[0] >= 100) {
      return { rating: ratings[0], reviews: counts[0] };
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

      let result = await fetchVivinoRating(query);

      // 실패 시 짧은 이름으로 재시도 (Red, Cabernet Sauvignon 등 제거)
      if (!result && wine.name_en) {
        const short = shortenName(wine.name_en);
        if (short !== wine.name_en && short.length >= 3) {
          result = await fetchVivinoRating(short);
          await sleep(1000);
        }
      }

      if (result) {
        await updateWineRating(wine.id, result.rating, result.reviews);
        console.log(`★ ${result.rating} (${result.reviews.toLocaleString()})`);
        found++;
      } else {
        console.log(`- 없음`);
      }

      total++;
      // Vivino rate limit 방지
      await sleep(1500);
    }

    offset += BATCH;
  }

  console.log(`\n🎉 완료! ${total}개 와인 중 ${found}개의 Vivino 별점 수집`);
}

main().catch(console.error);
