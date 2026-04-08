import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";

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

  if (nc.includes(nq)) return 1.0;
  if (nq.includes(nc) && nc.length > 5) return 0.95;

  const coreQ = nq.split(" ").filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  const coreC = nc.split(" ").filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  if (!coreQ.length) return 0;

  let found = 0;
  for (const w of coreQ) {
    if (coreC.some((cw) => cw === w)) found++;
  }
  return found / coreQ.length;
}

export interface WineFacts {
  winery: string;
  grapes: string;
  region: string;
  style: string;
  alcohol: string;
  allergens: string;
  description: string;
}

export interface VivinoCrawlResult {
  success: true;
  vivinoUrl: string;
  vivinoWineId: number;
  vivinoName: string;
  rating: number | null;
  reviews: number | null;
  facts: WineFacts;
  matchInfo?: {
    firstMatchScore: number;
    crossMatchScore: number;
    candidateCount: number;
  };
}

export interface VivinoCrawlError {
  success: false;
  error: string;
  step: "search" | "match" | "detail" | "cross_validation" | "browser";
}

export type VivinoCrawlResponse = VivinoCrawlResult | VivinoCrawlError;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function launchBrowser() {
  const isLocal = process.env.NODE_ENV === "development";
  const browser = await puppeteer.launch({
    executablePath: isLocal
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : await chromium.executablePath(
          "https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar"
        ),
    headless: true,
    args: isLocal
      ? ["--no-sandbox", "--disable-setuid-sandbox"]
      : chromium.args,
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );
  await page.setViewport({ width: 1280, height: 800 });
  return { browser, page };
}

// 상세페이지에서 JSON-LD + Facts 텍스트를 파싱하는 공통 evaluate 함수
const extractDetailData = () => {
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
};

export async function crawlSingleWine(wineName: string): Promise<VivinoCrawlResponse> {
  let browser;
  try {
    const launched = await launchBrowser();
    browser = launched.browser;
    const page = launched.page;

    await page.goto("https://www.vivino.com", { waitUntil: "networkidle2", timeout: 20000 });
    await sleep(500);

    // 검색바에 입력
    await page.click("input[name=q]", { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await sleep(300);
    await page.type("input[name=q]", wineName, { delay: 20 });
    await sleep(2500);

    // 자동완성 후보 수집
    const candidates = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href*="/w/"]'))
        .filter((el) => /\/w\/\d+/.test((el as HTMLAnchorElement).href))
        .map((el) => ({
          text: el.textContent?.trim() ?? "",
          href: (el as HTMLAnchorElement).href,
        }));
    });

    if (candidates.length === 0) {
      return { success: false, error: "자동완성 결과 없음", step: "search" };
    }

    // 1차 매칭: 자동완성 후보 점수
    const scored = candidates
      .map((c, i) => ({ ...c, score: matchScore(wineName, c.text), idx: i }))
      .sort((a, b) => b.score - a.score || a.idx - b.idx);

    const best = scored[0];
    if (best.score < 0.7) {
      return {
        success: false,
        error: `1차 매칭 실패 (${best.score.toFixed(2)}) — 최고 후보: "${best.text}"`,
        step: "match",
      };
    }

    // 상세 페이지 진입
    await page.goto(best.href, { waitUntil: "domcontentloaded", timeout: 10000 });
    await sleep(1000);

    const detailUrl = page.url();

    const data = await page.evaluate(extractDetailData);

    if (!data) {
      return { success: false, error: "상세 페이지에서 데이터 추출 실패", step: "detail" };
    }

    // 2차 교차 검증
    const crossScore = matchScore(wineName, data.name);
    if (crossScore < 0.7) {
      return {
        success: false,
        error: `교차 검증 실패 (${crossScore.toFixed(2)}) — 페이지 와인명: "${data.name}"`,
        step: "cross_validation",
      };
    }

    const wineIdMatch = detailUrl.match(/\/w\/(\d+)/);
    const vivinoWineId = wineIdMatch ? parseInt(wineIdMatch[1]) : 0;
    const cleanUrl = detailUrl.split("?")[0];

    return {
      success: true,
      vivinoUrl: cleanUrl,
      vivinoWineId,
      vivinoName: data.name,
      rating: data.rating > 0 ? data.rating : null,
      reviews: data.reviews > 0 ? data.reviews : null,
      facts: data.facts,
      matchInfo: {
        firstMatchScore: best.score,
        crossMatchScore: crossScore,
        candidateCount: candidates.length,
      },
    };
  } catch (e) {
    return {
      success: false,
      error: `브라우저 오류: ${(e as Error).message}`,
      step: "browser",
    };
  } finally {
    if (browser) await browser.close();
  }
}

export async function crawlByUrl(vivinoUrl: string): Promise<VivinoCrawlResponse> {
  // URL 유효성 검사
  if (!vivinoUrl.includes("vivino.com")) {
    return { success: false, error: "Vivino URL이 아닙니다", step: "browser" };
  }

  let browser;
  try {
    const launched = await launchBrowser();
    browser = launched.browser;
    const page = launched.page;

    await page.goto(vivinoUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    await sleep(1500);

    const detailUrl = page.url();
    const data = await page.evaluate(extractDetailData);

    if (!data) {
      return { success: false, error: "페이지에서 와인 데이터를 찾을 수 없습니다", step: "detail" };
    }

    const wineIdMatch = detailUrl.match(/\/w\/(\d+)/);
    const vivinoWineId = wineIdMatch ? parseInt(wineIdMatch[1]) : 0;
    const cleanUrl = detailUrl.split("?")[0];

    return {
      success: true,
      vivinoUrl: cleanUrl,
      vivinoWineId,
      vivinoName: data.name,
      rating: data.rating > 0 ? data.rating : null,
      reviews: data.reviews > 0 ? data.reviews : null,
      facts: data.facts,
    };
  } catch (e) {
    return {
      success: false,
      error: `브라우저 오류: ${(e as Error).message}`,
      step: "browser",
    };
  } finally {
    if (browser) await browser.close();
  }
}
