/**
 * Track B: Vivino 크롤 (raw_wines 보강)
 *
 * 전략:
 *   - 매 와인마다 새 브라우저를 launch → 크롤 → close (세션 오염 방지)
 *   - 브라우저 재사용 시 Vivino autocomplete 오염으로 매칭률 급락 → 반드시 매건 새 브라우저
 *   - autocomplete 검색 → 2단계 매칭 → 상세 데이터 추출
 *   - 사실 데이터만 raw_payload에 저장 (description 제외)
 *   - 이미지는 큐에 넣고 배치 사이에 비동기 업로드 (Supabase Storage)
 *   - 체크포인트 50건마다, resume 지원
 *
 * 저장 필드 (raw_payload):
 *   vivino_url, vivino_wine_id, vivino_name,
 *   vivino_rating, vivino_reviews,
 *   vivino_winery, vivino_grapes, vivino_region,
 *   vivino_style, vivino_alcohol, vivino_allergens,
 *   vivino_match_score, vivino_cross_score,
 *   vivino_scraped_at, vivino_match_failed
 *
 * 실행:
 *   NODE_ENV=development npx tsx scripts/scrape-vivino-raw.ts
 *   NODE_ENV=development npx tsx scripts/scrape-vivino-raw.ts --workers=2
 *   NODE_ENV=development npx tsx scripts/scrape-vivino-raw.ts --limit=100
 *   NODE_ENV=development npx tsx scripts/scrape-vivino-raw.ts --resume
 *   NODE_ENV=development npx tsx scripts/scrape-vivino-raw.ts --dry-run
 */

import { config } from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

config({ path: ".env.local" });

const CHROME_PATH = process.platform === "win32"
  ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ SUPABASE 환경변수 필요");
  process.exit(1);
}

const CHECKPOINT_PATH = join(tmpdir(), "vivino_scrape_checkpoint.json");
const BATCH_SIZE = 100;

// ─── CLI ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function argFlag(name: string): boolean {
  return args.includes(`--${name}`);
}
function argValue(name: string): string | null {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=")[1] : null;
}

const RESUME = argFlag("resume");
const DRY_RUN = argFlag("dry-run");
const NUM_WORKERS = parseInt(argValue("workers") || "2", 10);
const MAX_ITEMS = argValue("limit") ? parseInt(argValue("limit")!, 10) : Infinity;
const MATCH_THRESHOLD = 0.7;
const RETRY_MODE = (argValue("retry") || "browser") as "browser" | "all" | "match";

// Ban 감지 백오프
const BACKOFF_WINDOW = 20;        // 최근 N건 평가
const BACKOFF_FAIL_THRESHOLD = 10; // 최근 N건 중 X건 이상 search/browser 실패 시 pause
const BACKOFF_PAUSE_MS = 5 * 60 * 1000; // 5분 pause
const MAX_CONSECUTIVE_PAUSES = 2; // pause 연속 N회 발생하면 IP ban 확정 → rest 사이클 진입
// Ban 휴식은 exponential: 10m → 20m → 40m → 60m → 60m → 60m (누적 ~4.5h)
const BAN_REST_MS_SERIES = [10, 20, 40, 60, 60, 60].map((m) => m * 60 * 1000);
const MAX_BAN_CYCLES = BAN_REST_MS_SERIES.length;
const recentResults: Array<"ok" | "fail_susp" | "fail_other"> = [];
let bannedSignal = false;
let consecutivePauses = 0;
let banCycles = 0;
let bannedGaveUp = false; // true면 probe 다 실패로 정말 종료

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// 지터: base ± jitter 범위로 랜덤
const jitterSleep = (base: number, jitter: number) =>
  sleep(base + Math.floor(Math.random() * jitter * 2) - jitter);

// ─── 타입 ──────────────────────────────────────────────────────────────────

interface RawWine {
  id: string;
  source_id: string;
  name_ko: string;
  name_en: string;
  producer_ko: string | null;
  producer_en: string | null;
  raw_payload: Record<string, unknown> | null;
}

interface Checkpoint {
  lastProcessedId: string | null;
  total: number;
  matched: number;
  noResult: number;
  matchFailed: number;
  errors: number;
  startedAt: string;
  updatedAt: string;
}

// ─── 매칭 (vivino-crawler.ts 로직 재사용) ──────────────────────────────────

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

// ─── v4 Precision 가드 (rematch-vivino-v4.ts 로직 복사) ────────────────────

const GRAPE_LIST = [
  "cabernet sauvignon","cabernet franc","cabernet","merlot","syrah","shiraz","pinot noir","pinot grigio","pinot gris","pinot blanc",
  "chardonnay","sauvignon blanc","riesling","nebbiolo","sangiovese","tempranillo","grenache","garnacha","mourvedre","malbec","zinfandel",
  "chenin blanc","viognier","gewurztraminer","semillon","montepulciano","barbera","dolcetto","aglianico","verdicchio","garganega",
  "moscato","muscat","vermentino","albarino","godello","touriga","carmenere","petit verdot","gamay","nero d avola","primitivo",
  "corvina","fiano","falanghina","trebbiano","glera","pinotage","assyrtiko",
];
const COLOR_MARKERS: Record<"Red"|"White"|"Rosé", string[]> = {
  Red: ["rouge","rosso","tinto"], White: ["blanc","bianco","branco","blanco"], Rosé: ["rosado","rosato"],
};
const WINERY_SUFFIX_STOPS = new Set([
  ...STOP_WORDS,
  "winery","wines","wine","vineyards","vineyard","cellars","cellar","estate","estates",
  "domaine","maison","bodegas","bodega","tenuta","cantina","chateau","castillo","azienda","agricola","weingut","quinta",
]);

function guardWine(detailName: string, grapes: string[], vintage: number | null, style: string | null, winery: string | null): { pass: boolean; reason?: string } {
  const hay = normalize(detailName);
  if (grapes.length > 0) {
    const ourGrapesNorm = grapes.map(normalize);
    const ourMatch = ourGrapesNorm.some((g) => hay.includes(g));
    if (!ourMatch) {
      const otherGrape = GRAPE_LIST.find((g) => {
        const gn = normalize(g);
        if (hay.includes(gn)) return !ourGrapesNorm.some((og) => og.includes(gn) || gn.includes(og));
        return false;
      });
      if (otherGrape) return { pass: false, reason: `grape:${grapes.join(",")}vs${otherGrape}` };
    }
  }
  if (vintage != null) {
    const years = (detailName.match(/\b(19|20)\d{2}\b/g) ?? []).map((y) => parseInt(y, 10));
    if (years.length > 0 && !years.includes(vintage)) {
      return { pass: false, reason: `vintage:${vintage}vs${years.join(",")}` };
    }
  }
  if (style === "Red" || style === "White" || style === "Rosé") {
    let detected: keyof typeof COLOR_MARKERS | null = null;
    for (const k of ["Red","White","Rosé"] as const) {
      for (const m of COLOR_MARKERS[k]) { if (new RegExp(`\\b${m}\\b`).test(hay)) { detected = k; break; } }
      if (detected) break;
    }
    if (detected && detected !== style) return { pass: false, reason: `style:${style}vs${detected}` };
  }
  if (winery) {
    const tokens = normalize(winery).split(" ").filter((w) => w.length > 2 && !WINERY_SUFFIX_STOPS.has(w));
    if (tokens.length >= 2) {
      const found = tokens.filter((t) => hay.includes(t)).length;
      if (found / tokens.length < 0.7) return { pass: false, reason: `winery:${found}/${tokens.length}` };
    }
  }
  return { pass: true };
}

// ─── 브라우저 ──────────────────────────────────────────────────────────────

async function launchWorker(): Promise<{ browser: Browser; page: Page }> {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );
  await page.setViewport({ width: 1280, height: 800 });
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const type = req.resourceType();
    if (["font", "media"].includes(type)) {
      req.abort();
    } else {
      req.continue();
    }
  });
  return { browser, page };
}

// 상세페이지 데이터 추출 (브라우저 컨텍스트)
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

  // 와인 보틀 이미지
  const bottleImg = document.querySelector('img[src*="images.vivino.com/thumbs"]') as HTMLImageElement | null;
  const imageUrl = bottleImg?.src || null;

  return { name, rating, reviews, imageUrl, facts: { winery, grapes, region, style, alcohol, allergens, description } };
};

// ─── 이미지 다운로드 + Supabase Storage 업로드 ─────────────────────────────

async function uploadImage(sourceUrl: string, sourceId: string): Promise<string | null> {
  try {
    const imgRes = await fetch(sourceUrl);
    if (!imgRes.ok) return null;
    const buf = Buffer.from(await imgRes.arrayBuffer());
    if (buf.length < 500) return null; // too small, likely broken

    const ext = sourceUrl.match(/\.(png|jpg|jpeg|webp)/i)?.[1] || "png";
    const storagePath = `vivino/${sourceId}.${ext}`;

    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/wine-images/${storagePath}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": imgRes.headers.get("content-type") || `image/${ext}`,
        "x-upsert": "true",
      },
      body: buf,
    });
    if (!r.ok) return null;

    return `${SUPABASE_URL}/storage/v1/object/public/wine-images/${storagePath}`;
  } catch {
    return null;
  }
}

// ─── 단일 와인 크롤 (브라우저 재사용) ──────────────────────────────────────

interface CrawlResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  step?: string;
}

// 이미지 업로드 큐 (크롤 블로킹 방지)
const imageQueue: Array<{ sourceUrl: string; sourceId: string }> = [];
let imageUploaded = 0;

async function processImageQueue(): Promise<void> {
  while (imageQueue.length > 0) {
    const job = imageQueue.shift()!;
    const storageUrl = await uploadImage(job.sourceUrl, job.sourceId);
    if (storageUrl) {
      imageUploaded++;
      // Storage URL을 DB에 패치
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/raw_wines?source_id=eq.${job.sourceId}&source=eq.wine21&select=id,raw_payload`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const rows = (await res.json()) as Array<{ id: string; raw_payload: Record<string, unknown> | null }>;
      if (rows[0]) {
        await updatePayload(rows[0].id, rows[0].raw_payload, { vivino_image_storage: storageUrl });
      }
    }
  }
}

interface GuardInput {
  grapes: string[];
  vintage: number | null;
  style: string | null;
  winery: string | null;
}

async function crawlWine(_page: Page, wineName: string, sourceId: string, guardIn: GuardInput): Promise<CrawlResult> {
  let browser: Browser | null = null;
  try {
    const launched = await launchWorker();
    browser = launched.browser;
    const page = launched.page;

    await page.goto("https://www.vivino.com", { waitUntil: "networkidle2", timeout: 20000 });

    // Vivino IP ban 페이지 감지 (goto 직후 본문 체크)
    const banEarly = await page.evaluate(() => {
      const body = document.body?.innerText ?? "";
      return /temporarily blocked|exceeded bulk request|admin@vivino\.com|requests blocked/i.test(body);
    });
    if (banEarly) {
      return { success: false, error: "VIVINO_IP_BAN_DETECTED", step: "ban" };
    }

    try {
      await page.waitForSelector("input[name=q]", { timeout: 5000 });
    } catch (_e) {
      // 검색바 없음 → ban 페이지 또는 레이아웃 변경 가능성. 본문 재검사.
      const banLate = await page.evaluate(() => {
        const body = document.body?.innerText ?? "";
        return /temporarily blocked|exceeded bulk request|admin@vivino\.com|requests blocked/i.test(body);
      });
      if (banLate) return { success: false, error: "VIVINO_IP_BAN_DETECTED", step: "ban" };
      return { success: false, error: "검색바 timeout", step: "search" };
    }
    const input = await page.$("input[name=q]");
    if (!input) return { success: false, error: "검색바 없음", step: "search" };

    await input.click({ clickCount: 3 });
    await page.keyboard.press("Backspace");
    await sleep(100);
    await input.type(wineName, { delay: 20 });

    // 자동완성 재랭킹 대기: 2.5초 고정 (조기 탈출 시 부정확한 1차 후보로 매칭 실패)
    await sleep(2500);
    const candidates: Array<{ text: string; href: string }> = await page.evaluate(() => {
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

    // 1차 매칭
    const scored = candidates
      .map((c, i) => ({ ...c, score: matchScore(wineName, c.text), idx: i }))
      .sort((a, b) => b.score - a.score || a.idx - b.idx);

    const best = scored[0];
    if (best.score < MATCH_THRESHOLD) {
      return { success: false, error: `1차 매칭 실패 (${best.score.toFixed(2)})`, step: "match" };
    }

    // 상세 페이지
    await page.goto(best.href, { waitUntil: "domcontentloaded", timeout: 10000 });
    await sleep(500);

    const detailUrl = page.url();
    const data = await page.evaluate(extractDetailData);

    if (!data) {
      return { success: false, error: "상세 데이터 추출 실패", step: "detail" };
    }

    // 2차 교차 검증
    const crossScore = matchScore(wineName, data.name);
    if (crossScore < MATCH_THRESHOLD) {
      return { success: false, error: `교차 검증 실패 (${crossScore.toFixed(2)})`, step: "cross_validation" };
    }

    // v4 precision 가드 (품종/빈티지/스타일/와이너리)
    const guard = guardWine(data.name, guardIn.grapes, guardIn.vintage, guardIn.style, guardIn.winery);
    if (!guard.pass) {
      return { success: false, error: guard.reason, step: "guard" };
    }

    const wineIdMatch = detailUrl.match(/\/w\/(\d+)/);
    const vivinoWineId = wineIdMatch ? wineIdMatch[1] : null;

    // 이미지 → 큐에 넣고 즉시 반환 (블로킹 없음)
    if (data.imageUrl && !DRY_RUN) {
      imageQueue.push({ sourceUrl: data.imageUrl, sourceId });
    }

    return {
      success: true,
      data: {
        vivino_url: detailUrl.split("?")[0],
        vivino_wine_id: vivinoWineId,
        vivino_name: data.name,
        vivino_rating: data.rating > 0 ? data.rating : null,
        vivino_reviews: data.reviews > 0 ? data.reviews : null,
        vivino_winery: data.facts.winery || null,
        vivino_grapes: data.facts.grapes || null,
        vivino_region: data.facts.region || null,
        vivino_style: data.facts.style || null,
        vivino_alcohol: data.facts.alcohol || null,
        vivino_allergens: data.facts.allergens || null,
        vivino_image_url: data.imageUrl || null,
        vivino_match_score: best.score,
        vivino_cross_score: crossScore,
        vivino_scraped_at: new Date().toISOString(),
      },
    };
  } catch (e: any) {
    return { success: false, error: e.message?.slice(0, 150), step: "browser" };
  } finally {
    if (browser) try { await browser.close(); } catch {}
  }
}

// ─── DB ────────────────────────────────────────────────────────────────────

async function fetchBatch(afterId: string | null): Promise<RawWine[]> {
  // retry 모드별 대상 필터
  //   browser (default): 미처리 + browser 실패만
  //   all: 미처리 + 모든 실패 (browser/search/match/cross_validation)
  //   match: fail_step='match' 만 (wait-fix + guard 검증용)
  let orFilter: string;
  if (RETRY_MODE === "match") {
    orFilter = `(raw_payload->>vivino_fail_step.eq.match)`;
  } else {
    const failSteps = RETRY_MODE === "all"
      ? "browser,search,match,cross_validation"
      : "browser";
    orFilter =
      `(raw_payload->>vivino_scraped_at.is.null,` +
      `raw_payload.is.null,` +
      `raw_payload->>vivino_fail_step.in.(${failSteps}))`;
  }

  let url =
    `${SUPABASE_URL}/rest/v1/raw_wines` +
    `?source=eq.wine21` +
    `&name_en=not.is.null` +
    `&or=${orFilter}` +
    `&select=id,source_id,name_ko,name_en,producer_ko,producer_en,raw_payload` +
    `&order=id.asc` +
    `&limit=${BATCH_SIZE}`;

  if (afterId) url += `&id=gt.${afterId}`;

  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`fetchBatch ${res.status}`);
  return (await res.json()) as RawWine[];
}

async function updatePayload(id: string, currentPayload: Record<string, unknown> | null, patch: Record<string, unknown>): Promise<void> {
  if (DRY_RUN) return;
  const merged = { ...(currentPayload || {}), ...patch };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/raw_wines?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ raw_payload: merged }),
  });
  if (!res.ok) {
    // 일시적 서버 에러는 무시하고 계속 진행
    if (res.status >= 500) {
      console.error(`\n   ⚠ PATCH ${res.status} (id=${id}), 스킵`);
      return;
    }
    throw new Error(`PATCH ${res.status}`);
  }
}

// ─── 체크포인트 ─────────────────────────────────────────────────────────────

function loadCheckpoint(): Checkpoint {
  if (RESUME && existsSync(CHECKPOINT_PATH)) {
    const cp = JSON.parse(readFileSync(CHECKPOINT_PATH, "utf-8")) as Checkpoint;
    console.log(`📂 체크포인트: ${cp.total}건 처리, ${cp.matched} 매칭, ${cp.matchFailed} 실패`);
    return cp;
  }
  return {
    lastProcessedId: null,
    total: 0,
    matched: 0,
    noResult: 0,
    matchFailed: 0,
    errors: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function saveCheckpoint(cp: Checkpoint) {
  cp.updatedAt = new Date().toISOString();
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2));
}

// ─── 워커 풀 ───────────────────────────────────────────────────────────────

interface WorkerState {
  id: number;
  browser: Browser;
  page: Page;
  processed: number;
  restartCount: number;
}

async function createWorker(id: number): Promise<WorkerState> {
  const { browser, page } = await launchWorker();
  return { id, browser, page, processed: 0, restartCount: 0 };
}

async function restartWorker(worker: WorkerState): Promise<void> {
  try { await worker.browser.close(); } catch {}
  const { browser, page } = await launchWorker();
  worker.browser = browser;
  worker.page = page;
  worker.restartCount++;
}

// Vivino ban 상태 probe — 단건 요청으로 ban 페이지 여부 확인
async function probeBan(): Promise<boolean> {
  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.goto("https://www.vivino.com", { waitUntil: "networkidle2", timeout: 20000 });
    const stillBanned = await page.evaluate(() => {
      const body = document.body?.innerText ?? "";
      return /temporarily blocked|exceeded bulk request|admin@vivino\.com|requests blocked/i.test(body);
    });
    return stillBanned;
  } catch {
    return true; // 에러도 보수적으로 ban 상태로 간주
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// Ban rest 사이클: 휴식 → probe → 해제 시 재개 가능 (true) / 아직 ban (false) / 포기 (bannedGaveUp=true)
async function handleBanRestCycle(workers: WorkerState[]): Promise<boolean> {
  if (banCycles >= MAX_BAN_CYCLES) {
    console.error(`\n   🚨 ${MAX_BAN_CYCLES}사이클 probe 모두 실패 → 포기`);
    bannedGaveUp = true;
    return false;
  }
  const restMs = BAN_REST_MS_SERIES[banCycles];
  banCycles++;
  console.log(`\n   🛌 IP ban 감지 → ${restMs / 60000}분 휴식 (cycle ${banCycles}/${MAX_BAN_CYCLES})`);

  // 휴식 동안 워커 브라우저 닫기 (리소스 절약)
  for (const w of workers) {
    try { await w.browser.close(); } catch {}
  }

  await sleep(restMs);

  console.log(`   🔍 Probe: ban 해제 확인 중...`);
  const stillBanned = await probeBan();
  if (stillBanned) {
    console.log(`   ❌ 아직 차단 상태, 다음 사이클로`);
    return false;
  }

  console.log(`   ✅ 해제 확인 → 워커 재시작, 재개`);
  // 워커 재시작
  for (const w of workers) {
    const { browser, page } = await launchWorker();
    w.browser = browser;
    w.page = page;
  }
  // 신호·카운터 리셋
  bannedSignal = false;
  consecutivePauses = 0;
  recentResults.length = 0;
  return true;
}

// ─── 메인 ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("🍇 Vivino 크롤 시작 (Track B)");
  console.log(`   WORKERS=${NUM_WORKERS}, DRY=${DRY_RUN}, RESUME=${RESUME}, RETRY=${RETRY_MODE}`);
  if (MAX_ITEMS !== Infinity) console.log(`   LIMIT=${MAX_ITEMS}`);

  const cp = loadCheckpoint();
  const start = Date.now();

  // 워커 생성
  console.log(`   브라우저 ${NUM_WORKERS}개 시작...`);
  const workers: WorkerState[] = [];
  for (let i = 0; i < NUM_WORKERS; i++) {
    workers.push(await createWorker(i));
  }
  console.log(`   ✅ 브라우저 준비 완료\n`);

  let processed = 0;
  let done = false;

  try {
    while (!done && processed < MAX_ITEMS && !bannedGaveUp) {
      // Ban 감지 시 휴식 사이클: 해제될 때까지 대기·probe 반복
      while (bannedSignal && !bannedGaveUp) {
        const resumed = await handleBanRestCycle(workers);
        if (resumed) break; // 해제 → 본 루프 재개
        if (bannedGaveUp) break; // max cycle 초과 → 종료
      }
      if (bannedGaveUp) break;

      const batch = await fetchBatch(cp.lastProcessedId);
      if (batch.length === 0) {
        console.log(`\n📭 더 이상 처리할 행 없음`);
        break;
      }

      // 배치를 워커에 분배
      let batchIdx = 0;
      const batchPromises: Promise<void>[] = [];

      for (const worker of workers) {
        const workerBatch: RawWine[] = [];
        while (batchIdx < batch.length && workerBatch.length < Math.ceil(batch.length / NUM_WORKERS)) {
          workerBatch.push(batch[batchIdx++]);
        }
        if (workerBatch.length === 0) continue;

        batchPromises.push(
          (async () => {
            for (const wine of workerBatch) {
              if (processed >= MAX_ITEMS) return;

              const p = (wine.raw_payload ?? {}) as Record<string, unknown>;
              const guardIn: GuardInput = {
                grapes: (p.parsed_grape_varieties as string[]) ?? [],
                vintage: (p.parsed_vintage as number | null) ?? null,
                style: (p.parsed_wine_style as string | null) ?? null,
                winery: ((p.winery_en_clean as string | null) ?? (p.winery_en as string | null) ?? (p.parsed_brand as string | null)) ?? null,
              };
              const result = await crawlWine(worker.page, wine.name_en, wine.source_id, guardIn);
              worker.processed++;

              if (result.success && result.data) {
                // 재시도 성공 시 실패 플래그 명시적 제거
                const successPatch = {
                  ...result.data,
                  vivino_match_failed: null,
                  vivino_fail_step: null,
                  vivino_fail_error: null,
                };
                await updatePayload(wine.id, wine.raw_payload, successPatch);
                cp.matched++;
                recentResults.push("ok");
                consecutivePauses = 0; // 성공 시 연속 카운터 리셋
              } else {
                // Vivino ban 페이지 직접 감지 시 즉시 abort (crawlWine 내부 감지)
                if (result.step === "ban" || result.error === "VIVINO_IP_BAN_DETECTED") {
                  console.error(`\n   🚨 VIVINO IP BAN 페이지 감지 → 즉시 중단`);
                  bannedSignal = true;
                  return;
                }

                const failPatch: Record<string, unknown> = {
                  vivino_scraped_at: new Date().toISOString(),
                  vivino_match_failed: true,
                  vivino_fail_step: result.step,
                  vivino_fail_error: result.error?.slice(0, 100),
                };
                await updatePayload(wine.id, wine.raw_payload, failPatch);

                if (result.step === "search") cp.noResult++;
                else if (result.step === "match" || result.step === "cross_validation" || result.step === "guard") cp.matchFailed++;
                else cp.errors++;

                // Ban 의심 신호: search/browser 실패
                if (result.step === "search" || result.step === "browser") {
                  recentResults.push("fail_susp");
                  // 429/403 명시적 신호 감지 시 즉시 중단
                  if (result.error && /\b(429|403|rate.?limit|blocked)\b/i.test(result.error)) {
                    console.error(`\n   🚨 Ban 신호 감지: ${result.error}`);
                    bannedSignal = true;
                  }
                } else {
                  recentResults.push("fail_other");
                }

                // 브라우저 크래시 시 재시작
                if (result.step === "browser") {
                  console.error(`\n   ⚠ 워커${worker.id} 브라우저 오류, 재시작...`);
                  await restartWorker(worker);
                }
              }

              // 최근 window 유지
              if (recentResults.length > BACKOFF_WINDOW) {
                recentResults.splice(0, recentResults.length - BACKOFF_WINDOW);
              }
              // Ban 의심: 최근 window 중 search/browser 실패가 임계치 초과 시 5분 pause
              if (recentResults.length >= BACKOFF_WINDOW) {
                const suspFails = recentResults.filter((r) => r === "fail_susp").length;
                if (suspFails >= BACKOFF_FAIL_THRESHOLD) {
                  consecutivePauses++;
                  if (consecutivePauses > MAX_CONSECUTIVE_PAUSES) {
                    console.error(
                      `\n   🚨 연속 ${consecutivePauses}회 백오프 → IP BAN 확정, 즉시 중단`
                    );
                    bannedSignal = true;
                    return;
                  }
                  console.error(
                    `\n   🛑 최근 ${BACKOFF_WINDOW}건 중 ${suspFails}건 search/browser 실패 → ${BACKOFF_PAUSE_MS / 60000}분 pause (연속 ${consecutivePauses}/${MAX_CONSECUTIVE_PAUSES})`
                  );
                  await sleep(BACKOFF_PAUSE_MS);
                  recentResults.length = 0; // 윈도우 초기화
                }
              }

              cp.lastProcessedId = wine.id;
              cp.total++;
              processed++;

              // 명시적 ban 신호 시 즉시 루프 탈출
              if (bannedSignal) return;

              // 간격 (지터 500~1500ms)
              await jitterSleep(1000, 500);
            }
          })()
        );
      }

      await Promise.all(batchPromises);

      // 이미지 큐 처리 (배치 사이에 비동기로)
      if (imageQueue.length > 0) {
        await processImageQueue();
      }

      saveCheckpoint(cp);

      const elapsed = (Date.now() - start) / 1000;
      const rate = processed / elapsed;
      const matchPct = ((cp.matched / Math.max(cp.total, 1)) * 100).toFixed(1);
      process.stdout.write(
        `\r  처리=${cp.total} 매칭=${cp.matched}(${matchPct}%) 검색0=${cp.noResult} 매칭실패=${cp.matchFailed} err=${cp.errors} img=${imageUploaded} ${rate.toFixed(2)}/s    `
      );
    }
  } finally {
    // 브라우저 정리
    for (const w of workers) {
      try { await w.browser.close(); } catch {}
    }
  }

  saveCheckpoint(cp);
  const elapsed = (Date.now() - start) / 1000;
  if (bannedGaveUp) {
    console.log(`\n\n🚨 VIVINO IP BAN 지속 (${MAX_BAN_CYCLES}사이클 모두 차단) → 종료`);
  } else {
    console.log(`\n\n🎉 완료`);
  }
  console.log(`   처리: ${cp.total}건`);
  console.log(`   매칭: ${cp.matched}건 (${((cp.matched / Math.max(cp.total, 1)) * 100).toFixed(1)}%)`);
  console.log(`   검색 0건: ${cp.noResult}, 매칭 실패: ${cp.matchFailed}, 에러: ${cp.errors}`);
  console.log(`   소요: ${(elapsed / 60).toFixed(1)}분`);
  console.log(`   ban 사이클: ${banCycles}/${MAX_BAN_CYCLES}`);
  console.log(`   체크포인트: ${CHECKPOINT_PATH}`);
  if (bannedGaveUp) process.exit(2);
}

main().catch((e) => {
  console.error("\n❌", e);
  process.exit(1);
});
