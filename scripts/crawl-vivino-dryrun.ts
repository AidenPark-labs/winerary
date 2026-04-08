/**
 * Vivino 크롤링 Dry Run (DB 저장 없이 결과만 CSV로 출력)
 *
 * 임계값 0.5로 낮춰서 재시도, 결과를 vivino-dryrun-result.csv로 저장
 * 확인 후 crawl-vivino-apply.ts로 실제 적용
 *
 * 실행: npx tsx scripts/crawl-vivino-dryrun.ts
 */

import { config } from "dotenv";
import puppeteer from "puppeteer-core";
import { writeFileSync, appendFileSync } from "fs";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const THRESHOLD = 0.5;
const OUTPUT = "vivino-dryrun-result.csv";

const STOP = new Set([
  "la", "le", "de", "du", "des", "les", "el", "il", "di", "da", "del",
  "the", "and", "of", "et", "en", "a", "mon", "ma", "au",
  "rose", "red", "white", "brut", "dry", "sweet", "vin", "wine",
]);

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function matchScore(query: string, candidate: string): number {
  const nq = normalize(query);
  const nc = normalize(candidate);
  if (nc.includes(nq)) return 1.0;
  if (nq.includes(nc) && nc.length > 5) return 0.95;
  const coreQ = nq.split(" ").filter((w) => w.length > 2 && !STOP.has(w));
  const coreC = nc.split(" ").filter((w) => w.length > 2 && !STOP.has(w));
  if (!coreQ.length) return 0;
  let found = 0;
  for (const w of coreQ) { if (coreC.some((cw) => cw === w)) found++; }
  return found / coreQ.length;
}

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

async function main() {
  console.log(`🍇 Vivino Dry Run (임계값 ${THRESHOLD}) — DB 저장 없음\n`);

  // CSV 헤더
  writeFileSync(OUTPUT, "wine_id,our_name,vivino_name,score,cross_score,rating,reviews,url,winery,grapes,region\n");

  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--no-sandbox"],
  });

  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36");
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto("https://www.vivino.com", { waitUntil: "networkidle2", timeout: 20000 });

  // vivino_page_url이 없는 와인만 대상
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/wines?select=id,name_en&vivino_page_url=is.null&name_en=not.is.null&order=id&limit=2000`,
    { headers }
  );
  const wines = await res.json();
  let total = 0, matched = 0, skipped = 0;

  for (const wine of wines) {
    const query = wine.name_en;
    process.stdout.write(`  [${total + 1}/${wines.length}] ${query.substring(0, 40).padEnd(40)} `);

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

      const candidates = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href*="/w/"]'))
          .filter((el) => /\/w\/\d+/.test((el as HTMLAnchorElement).href))
          .map((el, i) => ({ text: el.textContent?.trim() ?? "", href: (el as HTMLAnchorElement).href, idx: i }))
      );

      if (!candidates.length) { console.log("- 결과 없음"); total++; skipped++; continue; }

      const scored = candidates.map((c) => ({ ...c, s: matchScore(query, c.text) })).sort((a, b) => b.s - a.s || a.idx - b.idx);
      if (scored[0].s < THRESHOLD) { console.log(`- 스킵 (${scored[0].s.toFixed(2)})`); total++; skipped++; continue; }

      await page.goto(scored[0].href, { waitUntil: "domcontentloaded", timeout: 10000 });
      await sleep(1500);
      const detailUrl = page.url().split("?")[0];

      const data = await page.evaluate(() => {
        let name = "", rating = 0, reviews = 0, winery = "";
        for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
          try {
            const d = JSON.parse(s.textContent || "");
            if (d.aggregateRating) {
              name = d.name ?? ""; rating = parseFloat(d.aggregateRating.ratingValue);
              reviews = parseInt(d.aggregateRating.ratingCount); winery = d.brand?.name ?? "";
            }
          } catch {}
        }
        if (!name) return null;
        const body = document.body.innerText;
        const fi = body.indexOf("Facts about");
        let grapes = "", region = "";
        if (fi >= 0) {
          const fb = body.substring(fi, fi + 1000);
          const gm = fb.match(/Grapes\s*\n\t(.+)/); if (gm) grapes = gm[1].trim();
          const rm = fb.match(/Region\s*\n\t(.+)/); if (rm) region = rm[1].trim();
        }
        return { name, rating, reviews, winery, grapes, region };
      });

      const crossScore = data ? matchScore(query, data.name) : 0;

      if (crossScore < THRESHOLD || !data) {
        console.log(`- 교차 실패 (${crossScore.toFixed(2)})`);
        skipped++;
      } else {
        const row = [wine.id, query, data.name, scored[0].s.toFixed(2), crossScore.toFixed(2), data.rating, data.reviews, detailUrl, data.winery, data.grapes, data.region].map(v => csvEscape(String(v ?? ""))).join(",");
        appendFileSync(OUTPUT, row + "\n");
        console.log(`✓ [${scored[0].s.toFixed(2)}/${crossScore.toFixed(2)}] ★${data.rating} ${data.name.substring(0, 30)}`);
        matched++;
      }

      await page.goto("https://www.vivino.com", { waitUntil: "domcontentloaded", timeout: 10000 });
      await sleep(500);
    } catch (e) {
      console.log(`- 에러: ${(e as Error).message?.substring(0, 40)}`);
      try { await page.goto("https://www.vivino.com", { waitUntil: "domcontentloaded", timeout: 10000 }); } catch {}
    }

    total++;
    await sleep(1500);
  }

  await browser.close();
  console.log(`\n🎉 완료! ${total}개 중 ${matched}개 매칭 / ${skipped}개 스킵`);
  console.log(`결과: ${OUTPUT}`);
}

main().catch(console.error);
