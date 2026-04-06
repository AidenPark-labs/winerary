/**
 * Vivino 크롤링 (Puppeteer)
 *
 * Chrome으로 Vivino 검색 → 결과 대기 → 첫 매칭 와인 클릭 → JSON-LD 추출
 *
 * 실행: npx tsx scripts/crawl-vivino-puppeteer.ts
 */

import { config } from "dotenv";
import puppeteer from "puppeteer-core";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function saveToDb(id: string, pageUrl: string, vivinoWineId: number, rating: number | null, reviews: number | null) {
  const update: Record<string, unknown> = { vivino_page_url: pageUrl, vivino_wine_id: vivinoWineId };
  if (rating) update.vivino_rating = rating;
  if (reviews) update.vivino_reviews = reviews;
  await fetch(`${SUPABASE_URL}/rest/v1/wines?id=eq.${id}`, {
    method: "PATCH", headers, body: JSON.stringify(update),
  });
}

async function main() {
  console.log("🍇 Vivino Puppeteer 크롤링 시작\n");

  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
  await page.setViewport({ width: 1280, height: 800 });

  let offset = 0;
  let total = 0;
  let found = 0;

  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/wines?select=id,name_ko,name_en&vivino_page_url=is.null&name_en=not.is.null&order=id&offset=${offset}&limit=50`,
      { headers }
    );
    const wines = await res.json();
    if (!Array.isArray(wines) || wines.length === 0) break;

    for (const wine of wines) {
      const query = wine.name_en || wine.name_ko;
      process.stdout.write(`  [${total + 1}] ${query.substring(0, 45).padEnd(45)} `);

      try {
        // 1. 검색 페이지 열기
        await page.goto(`https://www.vivino.com/search/wines?q=${encodeURIComponent(query)}`, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        });

        // 2. 와인 카드 링크 나타날 때까지 대기
        try {
          await page.waitForSelector('a[href*="/w/"]', { timeout: 8000 });
        } catch {
          console.log("- 결과 없음");
          total++;
          continue;
        }
        await sleep(300);

        // 3. 모든 /w/ 링크 수집
        const wineLinks = await page.evaluate(() =>
          [...new Set(
            Array.from(document.querySelectorAll('a[href*="/w/"]'))
              .map(a => (a as HTMLAnchorElement).href)
              .filter(h => /\/w\/\d+/.test(h))
          )]
        );

        if (wineLinks.length === 0) {
          console.log("- 링크 없음");
          total++;
          continue;
        }

        // 첫 번째 링크 사용
        const detailUrl = wineLinks[0];
        const wineIdMatch = detailUrl.match(/\/w\/(\d+)/);
        if (!wineIdMatch) {
          console.log("- ID 파싱 실패");
          total++;
          continue;
        }

        // 4. 상세 페이지에서 JSON-LD 추출
        await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 10000 });

        const rating = await page.evaluate(() => {
          const scripts = document.querySelectorAll('script[type="application/ld+json"]');
          for (const s of scripts) {
            try {
              const d = JSON.parse(s.textContent || "");
              if (d.aggregateRating) {
                return {
                  rating: parseFloat(d.aggregateRating.ratingValue),
                  reviews: parseInt(d.aggregateRating.ratingCount),
                };
              }
            } catch {}
          }
          return null;
        });

        const vivinoWineId = parseInt(wineIdMatch[1]);

        if (rating && rating.rating > 0) {
          await saveToDb(wine.id, detailUrl, vivinoWineId, rating.rating, rating.reviews);
          console.log(`★ ${rating.rating} (${rating.reviews.toLocaleString()})`);
        } else {
          await saveToDb(wine.id, detailUrl, vivinoWineId, null, null);
          console.log(`🔗 URL 저장`);
        }
        found++;
      } catch (e) {
        console.log(`- 에러: ${(e as Error).message?.substring(0, 40)}`);
      }

      total++;
      await sleep(2000);
    }

    offset += 50;
  }

  await browser.close();
  console.log(`\n🎉 완료! ${total}개 중 ${found}개 Vivino URL 수집`);
}

main().catch(console.error);
