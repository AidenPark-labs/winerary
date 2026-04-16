/**
 * wine21.com 목록 PoC (정제 추출기)
 * 4개 필드만 추출: name_ko / name_en / winery_ko / winery_en
 *
 * 실행: npx tsx scripts/poc-wine21.ts
 *
 * 가이드라인:
 * - 요청 간격 5초 이상
 * - 일반 브라우저 UA
 * - DB 저장 없음 (검증 단계)
 */

import puppeteer from "puppeteer-core";
import { writeFileSync } from "fs";

const LIST_URL = "https://www.wine21.com/13_search/wine_list.html";
const SLEEP_BETWEEN_PAGES_MS = 5000;
const TARGET_COUNT = 100;
const OUT_PATH = "/tmp/wine21_poc.json";

interface Wine {
  name_ko: string;
  name_en: string;
  winery_ko: string;
  winery_en: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("🍷 wine21 PoC (정제) 시작\n");

  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1280, height: 900 });

    console.log(`→ ${LIST_URL}`);
    await page.goto(LIST_URL, { waitUntil: "networkidle2", timeout: 30000 });

    await page.waitForFunction(
      () => (document.getElementById("wine_list")?.querySelectorAll("li").length ?? 0) > 0,
      { timeout: 15000 }
    );

    let clicks = 0;
    while (true) {
      const current = await page.evaluate(
        () => document.querySelectorAll("#wine_list li").length
      );
      if (current >= TARGET_COUNT) break;

      const moreVisible = await page.evaluate(() => {
        const btn = document.getElementById("wineListMoreBtn");
        if (!btn) return false;
        return window.getComputedStyle(btn).display !== "none";
      });
      if (!moreVisible) {
        console.log("(더보기 없음, 중단)");
        break;
      }

      await sleep(SLEEP_BETWEEN_PAGES_MS);
      await page.evaluate(() => {
        (document.getElementById("wineListMoreBtn") as HTMLElement | null)?.click();
      });

      try {
        await page.waitForFunction(
          (prev) => document.querySelectorAll("#wine_list li").length > prev,
          { timeout: 10000 },
          current
        );
      } catch {
        console.log("  ⚠ 추가 로드 실패");
        break;
      }
      clicks++;
      const after = await page.evaluate(
        () => document.querySelectorAll("#wine_list li").length
      );
      console.log(`더보기 ${clicks}회 → ${current} → ${after}`);
    }

    // tsx의 함수 헬퍼 주입(__name)을 피하기 위해 evaluate를 문자열로 전달
    const wines: Wine[] = await page.evaluate(`
      (function() {
        function norm(s) {
          return (s || "").replace(/\\u00a0/g, " ").replace(/\\s+/g, " ").trim();
        }
        function splitWinery(raw) {
          var s = (raw || "").replace(/\\u00a0/g, " ").trim();
          var m = s.match(/^(.+?)\\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9\\s,.&'\\-/]*)$/);
          if (m) return { ko: m[1].trim(), en: m[2].trim() };
          return { ko: s, en: "" };
        }
        var items = Array.prototype.slice.call(document.querySelectorAll("#wine_list li"));
        return items.map(function(li) {
          var wineryRaw = (li.querySelector(".winery a") && li.querySelector(".winery a").textContent || "").trim();
          var w = splitWinery(wineryRaw);
          var btnView = li.querySelector("h3 .btnView");
          var name_ko = "";
          if (btnView) {
            var nodes = Array.prototype.slice.call(btnView.childNodes);
            name_ko = norm(
              nodes
                .filter(function(n) { return n.nodeType === 3; })
                .map(function(n) { return n.textContent || ""; })
                .join(" ")
            );
          }
          var enEl = li.querySelector(".wine-name-en");
          var name_en = norm(enEl && enEl.textContent || "");
          return { name_ko: name_ko, name_en: name_en, winery_ko: w.ko, winery_en: w.en };
        });
      })()
    `);

    console.log(`\n✅ ${wines.length}건 추출\n`);

    // 품질 통계
    const stats = {
      total: wines.length,
      missing_name_ko: wines.filter((w) => !w.name_ko).length,
      missing_name_en: wines.filter((w) => !w.name_en).length,
      missing_winery_ko: wines.filter((w) => !w.winery_ko).length,
      missing_winery_en: wines.filter((w) => !w.winery_en).length,
    };
    console.log("=== 품질 통계 ===");
    console.log(stats);

    // 샘플 10건
    console.log("\n=== 샘플 10건 ===");
    wines.slice(0, 10).forEach((w, i) => {
      console.log(`\n[${i + 1}]`);
      console.log(`  KO: ${w.name_ko}`);
      console.log(`  EN: ${w.name_en}`);
      console.log(`  WK: ${w.winery_ko}`);
      console.log(`  WE: ${w.winery_en}`);
    });

    // 엣지케이스 리포트: 빈 필드가 있는 항목
    const edge = wines.filter(
      (w) => !w.name_ko || !w.name_en || !w.winery_ko || !w.winery_en
    );
    if (edge.length > 0) {
      console.log(`\n=== ⚠ 엣지케이스 ${edge.length}건 ===`);
      edge.slice(0, 10).forEach((w, i) => {
        console.log(`[${i + 1}] ${JSON.stringify(w)}`);
      });
    }

    writeFileSync(OUT_PATH, JSON.stringify(wines, null, 2));
    console.log(`\n💾 ${OUT_PATH} 저장`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
