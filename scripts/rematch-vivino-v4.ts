/**
 * (H1) Vivino 재매칭 본 실행 — v4 가드
 *
 * 대상: wine21 & vivino_url NULL & parsed_search_query 있음 (~22,010건)
 * 방식:
 *   - 매건 새 브라우저 (CLAUDE.md 규칙)
 *   - N 워커 병렬
 *   - 쿼리: parsed_search_query
 *   - v4 가드: 품종 / 빈티지 / 스타일 / 와이너리(winery_en_clean 우선)
 *   - DB 쓰기: 성공 시 vivino_url 등, 실패 시 fail marker
 *   - Ban 감지 백오프, 체크포인트 resume
 *
 * 실행:
 *   NODE_ENV=development npx tsx scripts/rematch-vivino-v4.ts
 *   NODE_ENV=development npx tsx scripts/rematch-vivino-v4.ts --workers=2
 *   NODE_ENV=development npx tsx scripts/rematch-vivino-v4.ts --limit=50 --dry-run
 *   NODE_ENV=development npx tsx scripts/rematch-vivino-v4.ts --resume
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import puppeteer, { type Browser } from "puppeteer-core";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const HEADERS = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

const CHROME_PATH = process.platform === "win32"
  ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const args = process.argv.slice(2);
const argV = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const argF = (n: string) => args.includes(`--${n}`);

const NUM_WORKERS = parseInt(argV("workers") || "2", 10);
const LIMIT = argV("limit") ? parseInt(argV("limit")!, 10) : Infinity;
const DRY_RUN = argF("dry-run");
const RESUME = argF("resume");
const THRESHOLD = 0.7;

const CHECKPOINT_PATH = join(tmpdir(), "rematch-vivino-v4-checkpoint.json");
const BATCH_FETCH = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (base: number, j: number) => sleep(base + Math.floor(Math.random() * j * 2) - j);

// ─── 매칭/정규화 ────────────────────────────────────────────────────────────

const STOP_WORDS = new Set(["la","le","de","du","des","les","el","il","di","da","del","the","and","of","et","en","a","mon","ma","au","rose","red","white","brut","dry","sweet","vin","wine"]);
function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function matchScore(query: string, candidate: string): number {
  const nq = normalize(query), nc = normalize(candidate);
  if (nc.includes(nq)) return 1.0;
  if (nq.includes(nc) && nc.length > 5) return 0.95;
  const coreQ = nq.split(" ").filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  const coreC = nc.split(" ").filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  if (!coreQ.length) return 0;
  let found = 0;
  for (const w of coreQ) if (coreC.some((cw) => cw === w)) found++;
  return found / coreQ.length;
}

// ─── v4 가드 ────────────────────────────────────────────────────────────────

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

async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    executablePath: CHROME_PATH, headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
}

// ─── 상세 데이터 추출 (scrape-vivino-raw.ts와 호환) ────────────────────────

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
  if (!name) {
    name = (document.querySelector("h1")?.textContent ?? "").trim();
  }
  if (!name) return null;
  const body = document.body.innerText;
  const factsIdx = body.indexOf("Facts about");
  let vivGrapes = "", region = "", style = "", alcohol = "", allergens = "";
  if (factsIdx >= 0) {
    const factsBlock = body.substring(factsIdx, factsIdx + 1500);
    const gm = factsBlock.match(/Grapes\s*\n\t(.+)/);
    const rm = factsBlock.match(/Region\s*\n\t(.+)/);
    const sm = factsBlock.match(/Wine style\s*\n\t(.+)/);
    const am = factsBlock.match(/Alcohol content\s*\n\t(.+)/);
    const al = factsBlock.match(/Allergens\s*\n\t(.+)/);
    if (gm) vivGrapes = gm[1].trim();
    if (rm) region = rm[1].trim();
    if (sm) style = sm[1].trim();
    if (am) alcohol = am[1].trim();
    if (al) allergens = al[1].trim();
  }
  return { name, rating, reviews, description, winery, region, style, alcohol, allergens, vivGrapes };
};

// ─── 타입 ───────────────────────────────────────────────────────────────────

interface Wine {
  id: string;
  name_en: string;
  query: string;
  grapes: string[];
  vintage: number | null;
  style: string | null;
  wineryEn: string | null;
  payload: Record<string, unknown>;
}

type FailStep = "browser" | "search" | "match" | "cross" | "guard";
interface CrawlOutcome {
  success: boolean;
  failStep?: FailStep;
  failReason?: string;
  data?: {
    vivino_url: string;
    vivino_wine_id: string | null;
    vivino_name: string;
    vivino_rating: number;
    vivino_reviews: number;
    vivino_winery: string;
    vivino_region: string;
    vivino_style: string;
    vivino_alcohol: string;
    vivino_allergens: string;
    vivino_grapes: string;
    vivino_match_score: number;
    vivino_cross_score: number;
  };
}

interface Checkpoint {
  lastProcessedId: string | null;
  total: number;
  matched: number;
  failed: Record<FailStep, number>;
  startedAt: string;
  updatedAt: string;
}

// ─── 크롤 (단일 와인) ───────────────────────────────────────────────────────

async function tryMatch(wine: Wine): Promise<CrawlOutcome> {
  let browser: Browser | null = null;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.goto("https://www.vivino.com", { waitUntil: "networkidle2", timeout: 20000 });
    await page.waitForSelector("input[name=q]", { timeout: 5000 });
    const input = await page.$("input[name=q]");
    if (!input) return { success: false, failStep: "search", failReason: "검색바 없음" };
    await input.click({ clickCount: 3 });
    await page.keyboard.press("Backspace");
    await sleep(100);
    await input.type(wine.query, { delay: 20 });

    let candidates: Array<{ text: string; href: string }> = [];
    const acStart = Date.now();
    while (Date.now() - acStart < 3000) {
      candidates = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href*="/w/"]'))
          .filter((el) => /\/w\/\d+/.test((el as HTMLAnchorElement).href))
          .map((el) => ({ text: el.textContent?.trim() ?? "", href: (el as HTMLAnchorElement).href }));
      });
      if (candidates.length > 0) break;
      await sleep(200);
    }
    if (!candidates.length) return { success: false, failStep: "search", failReason: "자동완성 결과 없음" };

    const scored = candidates
      .map((c, i) => ({ ...c, score: matchScore(wine.query, c.text), idx: i }))
      .sort((a, b) => b.score - a.score || a.idx - b.idx);
    const best = scored[0];
    if (best.score < THRESHOLD) {
      return { success: false, failStep: "match", failReason: `1차 ${best.score.toFixed(2)}` };
    }

    await page.goto(best.href, { waitUntil: "domcontentloaded", timeout: 10000 });
    await sleep(500);
    const detailUrl = page.url();
    const data = await page.evaluate(extractDetailData);
    if (!data) return { success: false, failStep: "cross", failReason: "상세 데이터 추출 실패" };

    const crossScore = matchScore(wine.query, data.name);
    if (crossScore < THRESHOLD) {
      return { success: false, failStep: "cross", failReason: `2차 ${crossScore.toFixed(2)}` };
    }

    const guard = guardWine(data.name, wine.grapes, wine.vintage, wine.style, wine.wineryEn);
    if (!guard.pass) {
      return { success: false, failStep: "guard", failReason: guard.reason };
    }

    const wineIdMatch = detailUrl.match(/\/w\/(\d+)/);
    return {
      success: true,
      data: {
        vivino_url: detailUrl.split("?")[0],
        vivino_wine_id: wineIdMatch ? wineIdMatch[1] : null,
        vivino_name: data.name,
        vivino_rating: data.rating,
        vivino_reviews: data.reviews,
        vivino_winery: data.winery,
        vivino_region: data.region,
        vivino_style: data.style,
        vivino_alcohol: data.alcohol,
        vivino_allergens: data.allergens,
        vivino_grapes: data.vivGrapes,
        vivino_match_score: best.score,
        vivino_cross_score: crossScore,
      },
    };
  } catch (e) {
    return { success: false, failStep: "browser", failReason: (e as Error).message.slice(0, 200) };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ─── DB ─────────────────────────────────────────────────────────────────────

async function fetchWines(afterId: string | null): Promise<Wine[]> {
  let url =
    `${SUPABASE_URL}/rest/v1/raw_wines` +
    `?source=eq.wine21` +
    `&raw_payload->>vivino_url=is.null` +
    `&raw_payload->>parsed_search_query=not.is.null` +
    `&raw_payload->>parsed_search_query=neq.` +
    `&raw_payload->>vivino_rematch_tried_at=is.null` +
    `&select=id,name_en,raw_payload` +
    `&order=id.asc` +
    `&limit=${BATCH_FETCH}`;
  if (afterId) url += `&id=gt.${afterId}`;
  // 5xx/네트워크 transient 에러 재시도 (2s, 4s, 8s, 16s)
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.ok) {
        const rows = (await res.json()) as Array<{ id: string; name_en: string; raw_payload: Record<string, unknown> }>;
        return mapRows(rows);
      }
      if (res.status >= 500 || res.status === 429) {
        lastErr = new Error(`fetchWines ${res.status} (transient, attempt ${attempt})`);
      } else {
        throw new Error(`fetchWines ${res.status}`);
      }
    } catch (e) {
      lastErr = e as Error;
    }
    if (attempt < 5) {
      const delay = 2000 * Math.pow(2, attempt - 1);
      console.error(`\n   ⚠ fetchWines 재시도 ${attempt}: ${lastErr?.message} → ${delay}ms 후 재시도`);
      await sleep(delay);
    }
  }
  throw lastErr ?? new Error("fetchWines 재시도 초과");
}

function mapRows(rows: Array<{ id: string; name_en: string; raw_payload: Record<string, unknown> }>): Wine[] {
  return rows.map((r) => {
    const p = r.raw_payload ?? {};
    return {
      id: r.id,
      name_en: r.name_en,
      query: (p.parsed_search_query as string) ?? "",
      grapes: (p.parsed_grape_varieties as string[]) ?? [],
      vintage: (p.parsed_vintage as number | null) ?? null,
      style: (p.parsed_wine_style as string | null) ?? null,
      wineryEn: ((p.winery_en_clean as string | null) ?? (p.winery_en as string | null)) ?? null,
      payload: p,
    };
  });
}

async function saveSuccess(wine: Wine, data: NonNullable<CrawlOutcome["data"]>): Promise<void> {
  if (DRY_RUN) return;
  const merged = {
    ...wine.payload,
    ...data,
    vivino_scraped_at: new Date().toISOString(),
    vivino_rematched: true,
    vivino_rematch_version: "v4",
    vivino_match_failed: false,
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/raw_wines?id=eq.${wine.id}`, {
    method: "PATCH",
    headers: { ...HEADERS, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ raw_payload: merged }),
  });
  if (!res.ok) throw new Error(`saveSuccess ${res.status} id=${wine.id}`);
}

async function saveFailure(wine: Wine, step: FailStep, reason: string | undefined): Promise<void> {
  if (DRY_RUN) return;
  const merged = {
    ...wine.payload,
    vivino_rematch_tried_at: new Date().toISOString(),
    vivino_rematch_version: "v4",
    vivino_rematch_fail_step: step,
    vivino_rematch_fail_reason: reason ?? null,
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/raw_wines?id=eq.${wine.id}`, {
    method: "PATCH",
    headers: { ...HEADERS, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ raw_payload: merged }),
  });
  if (!res.ok) throw new Error(`saveFailure ${res.status} id=${wine.id}`);
}

// ─── 체크포인트 ─────────────────────────────────────────────────────────────

function loadCheckpoint(): Checkpoint {
  if (RESUME && existsSync(CHECKPOINT_PATH)) {
    const cp = JSON.parse(readFileSync(CHECKPOINT_PATH, "utf-8")) as Checkpoint;
    console.log(`📂 체크포인트: total=${cp.total} matched=${cp.matched} (from ${cp.lastProcessedId?.slice(0, 8)})`);
    return cp;
  }
  return {
    lastProcessedId: null, total: 0, matched: 0,
    failed: { browser: 0, search: 0, match: 0, cross: 0, guard: 0 },
    startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

function saveCheckpoint(cp: Checkpoint) {
  cp.updatedAt = new Date().toISOString();
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2));
}

// ─── Ban 감지 백오프 ───────────────────────────────────────────────────────

const BACKOFF_WINDOW = 20;
const BACKOFF_FAIL_THRESHOLD = 15;
const BACKOFF_PAUSE_MS = 5 * 60 * 1000;
const recentResults: Array<"ok" | "fail_susp" | "fail_other"> = [];

function recordResult(ok: boolean, step: FailStep | null) {
  const r = ok ? "ok" : (step === "browser" || step === "search" ? "fail_susp" : "fail_other");
  recentResults.push(r);
  if (recentResults.length > BACKOFF_WINDOW) recentResults.shift();
}

function isBanned(): boolean {
  if (recentResults.length < BACKOFF_WINDOW) return false;
  const susp = recentResults.filter((x) => x === "fail_susp").length;
  return susp >= BACKOFF_FAIL_THRESHOLD;
}

// ─── 워커 루프 ──────────────────────────────────────────────────────────────

async function runWorkers(cp: Checkpoint, queue: Wine[], processedCap: number): Promise<void> {
  let idx = 0;
  let processedThisRun = 0;
  const mutex = { taking: false };

  async function take(): Promise<Wine | null> {
    while (mutex.taking) await sleep(5);
    mutex.taking = true;
    try {
      if (idx >= queue.length || processedThisRun >= processedCap) return null;
      return queue[idx++];
    } finally {
      mutex.taking = false;
    }
  }

  const worker = async (wid: number) => {
    while (true) {
      const w = await take();
      if (!w) break;
      if (isBanned()) {
        console.log(`\n   🛑 [w${wid}] Ban 의심 → ${BACKOFF_PAUSE_MS / 60000}분 pause`);
        await sleep(BACKOFF_PAUSE_MS);
        recentResults.length = 0;
      }

      const outcome = await tryMatch(w);
      recordResult(outcome.success, outcome.failStep ?? null);

      try {
        if (outcome.success && outcome.data) {
          await saveSuccess(w, outcome.data);
          cp.matched++;
        } else if (outcome.failStep) {
          await saveFailure(w, outcome.failStep, outcome.failReason);
          cp.failed[outcome.failStep]++;
        }
      } catch (e) {
        console.error(`\n   ⚠ DB save 실패 id=${w.id}: ${(e as Error).message}`);
      }

      cp.total++;
      cp.lastProcessedId = w.id;
      processedThisRun++;

      if (cp.total % 10 === 0) {
        const failedSum = Object.values(cp.failed).reduce((s, n) => s + n, 0);
        const rate = cp.matched / Math.max(cp.total, 1);
        process.stdout.write(
          `\r  total=${cp.total} matched=${cp.matched} (${(rate * 100).toFixed(1)}%) failed=${failedSum} [br=${cp.failed.browser} sr=${cp.failed.search} mt=${cp.failed.match} cr=${cp.failed.cross} gd=${cp.failed.guard}]    `
        );
      }
      if (cp.total % 50 === 0) saveCheckpoint(cp);
      await jitter(1000, 500);
    }
  };

  await Promise.all(Array.from({ length: NUM_WORKERS }, (_, i) => worker(i + 1)));
}

// ─── 메인 ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🚀 Vivino 재매칭 v4 (workers=${NUM_WORKERS}, DRY=${DRY_RUN}, RESUME=${RESUME})`);
  if (LIMIT !== Infinity) console.log(`   LIMIT=${LIMIT}`);

  const cp = loadCheckpoint();
  const start = Date.now();
  let processedThisRun = 0;

  while (processedThisRun < LIMIT) {
    const wines = await fetchWines(cp.lastProcessedId);
    if (!wines.length) { console.log("\n📭 더 처리할 와인 없음"); break; }

    const remaining = LIMIT === Infinity ? wines.length : Math.min(LIMIT - processedThisRun, wines.length);
    const queue = wines.slice(0, remaining);

    await runWorkers(cp, queue, remaining);
    processedThisRun += queue.length;
    saveCheckpoint(cp);

    if (queue.length < BATCH_FETCH) {
      // 다음 페이지가 없을 가능성 — 한 번 더 loop에서 fetch로 확인
    }
  }

  saveCheckpoint(cp);
  const elapsed = ((Date.now() - start) / 1000 / 60).toFixed(1);
  console.log(`\n\n🎉 완료`);
  console.log(`   처리: ${cp.total} (이번 run ${processedThisRun})`);
  console.log(`   매칭: ${cp.matched} (${((cp.matched / cp.total) * 100).toFixed(1)}%)`);
  console.log(`   실패: ${JSON.stringify(cp.failed)}`);
  console.log(`   소요: ${elapsed}분`);
  console.log(`   체크포인트: ${CHECKPOINT_PATH}`);
}

main().catch((e) => { console.error("\n❌", e); process.exit(1); });
