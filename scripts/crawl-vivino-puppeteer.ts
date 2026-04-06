/**
 * Vivino 크롤링 (Puppeteer v5)
 *
 * 1. 홈페이지 검색바 자동완성 → 후보 수집
 * 2. stop words 제외 핵심 단어 매칭으로 최고 후보 선택 (≥ 0.7)
 * 3. 상세 페이지 진입 → JSON-LD에서 와인명 + 별점 + URL 추출
 * 4. 교차 검증: 상세페이지 와인명에 검색어 핵심 단어 ≥ 0.7 비율 포함 시 저장
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

const STOP_WORDS = new Set([
  "la", "le", "de", "du", "des", "les", "el", "il", "di", "da", "del",
  "the", "and", "of", "et", "en", "a", "mon", "ma", "au",
  "rose", "red", "white", "brut", "dry", "sweet", "vin", "wine",
]);

function normalize(s: string): string {
  return s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchScore(query: string, candidate: string): number {
  const nq = normalize(query);
  const nc = normalize(candidate);

  // 검색어가 후보에 완전 포함
  if (nc.includes(nq)) return 1.0;
  // 후보가 검색어에 완전 포함 (짧은 후보명)
  if (nq.includes(nc) && nc.length > 5) return 0.95;

  // 핵심 단어 매칭 (stop words 제외)
  const coreQ = nq.split(" ").filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  const coreC = nc.split(" ").filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  if (!coreQ.length) return 0;

  let found = 0;
  for (const w of coreQ) {
    if (coreC.some((cw) => cw === w)) found++;
  }
  return found / coreQ.length;
}

interface WineFacts {
  winery?: string;
  grapes?: string;
  region?: string;
  style?: string;
  alcohol?: string;
  allergens?: string;
  description?: string;
}

async function saveToDb(id: string, pageUrl: string, vivinoWineId: number, rating: number | null, reviews: number | null, facts?: WineFacts) {
  const cleanUrl = pageUrl.split("?")[0];
  const update: Record<string, unknown> = {
    vivino_url: cleanUrl,
    vivino_page_url: cleanUrl,
    vivino_wine_id: vivinoWineId,
  };
  if (rating) update.vivino_rating = rating;
  if (reviews) update.vivino_reviews = reviews;
  if (facts?.winery) update.vivino_winery = facts.winery;
  if (facts?.grapes) update.vivino_grapes = facts.grapes;
  if (facts?.region) update.vivino_region = facts.region;
  if (facts?.style) update.vivino_style = facts.style;
  if (facts?.alcohol) update.vivino_alcohol = facts.alcohol;
  if (facts?.description) update.vivino_description = facts.description;
  if (facts?.allergens) update.vivino_allergens = facts.allergens;
  await fetch(`${SUPABASE_URL}/rest/v1/wines?id=eq.${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(update),
  });
}

async function main() {
  console.log("🍇 Vivino Puppeteer 크롤링 v5 시작\n");

  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );
  await page.setViewport({ width: 1280, height: 800 });

  await page.goto("https://www.vivino.com", { waitUntil: "networkidle2", timeout: 20000 });

  let offset = 0;
  let total = 0;
  let found = 0;
  let skipped = 0;
  let noResult = 0;

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
        const input = await page.$("input[name=q]");
        if (!input) {
          await page.goto("https://www.vivino.com", { waitUntil: "networkidle2", timeout: 15000 });
          await sleep(1000);
        }

        await page.click("input[name=q]", { clickCount: 3 });
        await page.keyboard.press("Backspace");
        await sleep(300);
        await page.type("input[name=q]", query, { delay: 20 });
        await sleep(2500);

        const candidates = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('a[href*="/w/"]'))
            .filter((el) => /\/w\/\d+/.test((el as HTMLAnchorElement).href))
            .map((el) => ({
              text: el.textContent?.trim() ?? "",
              href: (el as HTMLAnchorElement).href,
            }));
        });

        if (candidates.length === 0) {
          console.log("- 결과 없음");
          noResult++;
          total++;
          continue;
        }

        // 1차: 자동완성 후보 점수 계산 (동점 시 Vivino 순서 유지)
        const scored = candidates
          .map((c, i) => ({ ...c, score: matchScore(query, c.text), idx: i }))
          .sort((a, b) => b.score - a.score || a.idx - b.idx);

        const best = scored[0];
        if (best.score < 0.7) {
          console.log(`- 1차 실패 (${best.score.toFixed(2)}) "${best.text.substring(0, 35)}"`);
          skipped++;
          total++;
          continue;
        }

        // 상세 페이지 진입
        await page.goto(best.href, { waitUntil: "domcontentloaded", timeout: 10000 });
        await sleep(1000);

        const detailUrl = page.url();

        const data = await page.evaluate(() => {
          // JSON-LD에서 별점 + 기본 정보
          let name = "", rating = 0, reviews = 0, description = "", winery = "";
          const scripts = document.querySelectorAll('script[type="application/ld+json"]');
          for (const s of scripts) {
            try {
              const d = JSON.parse(s.textContent || "");
              if (d.aggregateRating) {
                name = d.name ?? "";
                rating = parseFloat(d.aggregateRating.ratingValue);
                reviews = parseInt(d.aggregateRating.ratingCount);
                description = d.description ?? "";
                winery = d.brand?.name ?? "";
              }
            } catch {}
          }
          if (!name) return null;

          // Facts 텍스트에서 추가 정보 파싱
          const body = document.body.innerText;
          const factsIdx = body.indexOf("Facts about");
          let grapes = "", region = "", style = "", alcohol = "", allergens = "";
          if (factsIdx >= 0) {
            const factsBlock = body.substring(factsIdx, factsIdx + 1500);
            const grapesMatch = factsBlock.match(/Grapes\s*\n\t(.+)/);
            const regionMatch = factsBlock.match(/Region\s*\n\t(.+)/);
            const styleMatch = factsBlock.match(/Wine style\s*\n\t(.+)/);
            const alcoholMatch = factsBlock.match(/Alcohol content\s*\n\t(.+)/);
            const allergensMatch = factsBlock.match(/Allergens\s*\n\t(.+)/);
            if (grapesMatch) grapes = grapesMatch[1].trim();
            if (regionMatch) region = regionMatch[1].trim();
            if (styleMatch) style = styleMatch[1].trim();
            if (alcoholMatch) alcohol = alcoholMatch[1].trim();
            if (allergensMatch) allergens = allergensMatch[1].trim();
          }

          return { name, rating, reviews, facts: { winery, grapes, region, style, alcohol, allergens, description } };
        });

        // 2차: 교차 검증
        const crossScore = data ? matchScore(query, data.name) : 0;

        if (crossScore < 0.7) {
          console.log(`- 교차 실패 (${crossScore.toFixed(2)}) "${data?.name?.substring(0, 35) ?? "N/A"}"`);
          skipped++;
          await page.goto("https://www.vivino.com", { waitUntil: "domcontentloaded", timeout: 10000 });
          await sleep(500);
          total++;
          continue;
        }

        const wineIdMatch = detailUrl.match(/\/w\/(\d+)/);
        const vivinoWineId = wineIdMatch ? parseInt(wineIdMatch[1]) : 0;

        if (data && data.rating > 0) {
          await saveToDb(wine.id, detailUrl, vivinoWineId, data.rating, data.reviews, data.facts);
          console.log(`★ ${data.rating} (${data.reviews.toLocaleString()}) ${data.facts.winery || ""} | ${data.facts.grapes || ""} | ${data.facts.region || ""}`);
        } else {
          await saveToDb(wine.id, detailUrl, vivinoWineId, null, null, data?.facts);
          console.log(`🔗 ${detailUrl.split("?")[0].substring(24)}`);
        }
        found++;

        await page.goto("https://www.vivino.com", { waitUntil: "domcontentloaded", timeout: 10000 });
        await sleep(500);
      } catch (e) {
        console.log(`- 에러: ${(e as Error).message?.substring(0, 40)}`);
        try {
          await page.goto("https://www.vivino.com", { waitUntil: "domcontentloaded", timeout: 10000 });
        } catch {}
      }

      total++;
      await sleep(1500);
    }

    offset += 50;
  }

  await browser.close();
  console.log(`\n🎉 완료! ${total}개 중 ${found}개 수집 / ${skipped}개 스킵 / ${noResult}개 결과없음`);
}

main().catch(console.error);
