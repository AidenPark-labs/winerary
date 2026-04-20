/**
 * Vivino 재매칭 파일럿
 *
 * 목적: 기존 매칭 실패 건에 대해 parsed_search_query로 재시도 시 매칭률 측정
 * 방식:
 *   - 대상: wine21 & vivino_url 없음 & parsed_search_query 있음 (21K건)
 *   - 샘플: 100건 (랜덤 offset)
 *   - 매건 새 브라우저 (Vivino autocomplete 세션 오염 방지 — CLAUDE.md 규칙)
 *   - autocomplete 검색: parsed_search_query
 *   - 1차 매칭: parsed_search_query vs 후보 text (≥0.7)
 *   - 2차 교차검증: parsed_search_query vs 상세페이지 name (≥0.7)
 *   - DB 쓰지 않음
 *
 * 실행: NODE_ENV=development npx tsx scripts/pilot-vivino-rematch.ts
 *       옵션: --limit=50 --offset=1000
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import puppeteer, { type Browser } from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";

const CHROME_PATH = process.platform === "win32"
  ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const args = process.argv.slice(2);
const argV = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const LIMIT = parseInt(argV("limit") || "100", 10);
const OFFSET = argV("offset") !== undefined ? parseInt(argV("offset")!, 10) : Math.floor(Math.random() * 20000);
const THRESHOLD = 0.7;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (base: number, j: number) => sleep(base + Math.floor(Math.random() * j * 2) - j);

// ─── matchScore (scrape-vivino-raw.ts에서 그대로 복제) ────────────────────────

const STOP_WORDS = new Set([
  "la","le","de","du","des","les","el","il","di","da","del",
  "the","and","of","et","en","a","mon","ma","au",
  "rose","red","white","brut","dry","sweet","vin","wine",
]);
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

// ─── 품종/빈티지 가드 (명시적 충돌만 reject) ──────────────────────────────────

// 주요 품종 화이트리스트 — detail name에서 품종 단서 감지용
const GRAPE_LIST = [
  "cabernet sauvignon","cabernet franc","cabernet","merlot","syrah","shiraz","pinot noir","pinot grigio","pinot gris","pinot blanc",
  "chardonnay","sauvignon blanc","riesling","nebbiolo","sangiovese","tempranillo","grenache","garnacha","mourvedre","malbec","zinfandel",
  "chenin blanc","viognier","gewurztraminer","semillon","montepulciano","barbera","dolcetto","aglianico","verdicchio","garganega",
  "moscato","muscat","vermentino","albarino","godello","touriga","carmenere","petit verdot","gamay","nero d avola","primitivo",
  "corvina","fiano","falanghina","trebbiano","glera","pinotage","assyrtiko",
];

// 색 마커 (외국어 위주 — 영어 "red/white/rose"는 다른 맥락에도 등장해 FP 위험)
const COLOR_MARKERS: Record<"Red" | "White" | "Rosé", string[]> = {
  Red: ["rouge", "rosso", "tinto"],
  White: ["blanc", "bianco", "branco", "blanco"],
  Rosé: ["rosado", "rosato"],
};

// 와이너리 토큰에서 제외할 suffix 단어
const WINERY_SUFFIX_STOPS = new Set([
  ...STOP_WORDS,
  "winery","wines","wine","vineyards","vineyard","cellars","cellar","estate","estates",
  "domaine","maison","bodegas","bodega","tenuta","cantina","chateau","castillo","azienda","agricola","weingut","quinta",
]);

function guardWine(
  detailName: string,
  grapes: string[],
  vintage: number | null,
  style: string | null,
  wineryEn: string | null,
): { pass: boolean; reason?: string } {
  const hay = normalize(detailName);

  // 1. 품종 가드
  if (grapes.length > 0) {
    const ourGrapesNorm = grapes.map(normalize);
    const ourMatch = ourGrapesNorm.some((g) => hay.includes(g));
    if (!ourMatch) {
      const otherGrape = GRAPE_LIST.find((g) => {
        const gn = normalize(g);
        if (hay.includes(gn)) {
          return !ourGrapesNorm.some((og) => og.includes(gn) || gn.includes(og));
        }
        return false;
      });
      if (otherGrape) {
        return { pass: false, reason: `품종 충돌 (우리=${grapes.join(",")}, detail=${otherGrape})` };
      }
    }
  }

  // 2. 빈티지 가드
  if (vintage != null) {
    const yearsInDetail = (detailName.match(/\b(19|20)\d{2}\b/g) ?? []).map((y) => parseInt(y, 10));
    if (yearsInDetail.length > 0 && !yearsInDetail.includes(vintage)) {
      return { pass: false, reason: `빈티지 충돌 (우리=${vintage}, detail=${yearsInDetail.join(",")})` };
    }
  }

  // 3. 스타일(색) 가드 — Red/White/Rosé 간 상호 충돌만 검출
  if (style === "Red" || style === "White" || style === "Rosé") {
    let detected: keyof typeof COLOR_MARKERS | null = null;
    for (const k of ["Red", "White", "Rosé"] as const) {
      for (const m of COLOR_MARKERS[k]) {
        if (new RegExp(`\\b${m}\\b`).test(hay)) { detected = k; break; }
      }
      if (detected) break;
    }
    if (detected && detected !== style) {
      return { pass: false, reason: `스타일 충돌 (우리=${style}, detail=${detected})` };
    }
  }

  // 4. 와이너리 가드 — 핵심 토큰 ≥ 70% 포함
  if (wineryEn) {
    const tokens = normalize(wineryEn).split(" ").filter((w) => w.length > 2 && !WINERY_SUFFIX_STOPS.has(w));
    if (tokens.length >= 2) {
      const found = tokens.filter((t) => hay.includes(t)).length;
      if (found / tokens.length < 0.7) {
        return { pass: false, reason: `와이너리 토큰 부족 (${found}/${tokens.length}: ${tokens.join(",")})` };
      }
    }
  }

  return { pass: true };
}

// ─── 브라우저 ──────────────────────────────────────────────────────────────

async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
}

// ─── 단일 와인 시도 ─────────────────────────────────────────────────────────

type Step = "browser" | "search" | "match" | "cross" | "guard" | "ok";
interface Result {
  id: string;
  name_en: string;
  query: string;
  grapes: string[];
  vintage: number | null;
  style: string | null;
  wineryEn: string | null;
  step: Step;
  score1?: number;
  score2?: number;
  candidateText?: string;
  detailName?: string;
  detailUrl?: string;
  guardReason?: string;
  error?: string;
}

async function tryMatch(wine: { id: string; name_en: string; query: string; grapes: string[]; vintage: number | null; style: string | null; wineryEn: string | null }): Promise<Result> {
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
    if (!input) return { ...wine, step: "search", error: "검색바 없음" };
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
    if (candidates.length === 0) return { ...wine, step: "search", error: "자동완성 결과 없음" };

    const scored = candidates
      .map((c, i) => ({ ...c, score: matchScore(wine.query, c.text), idx: i }))
      .sort((a, b) => b.score - a.score || a.idx - b.idx);
    const best = scored[0];
    if (best.score < THRESHOLD) {
      return { ...wine, step: "match", score1: best.score, candidateText: best.text };
    }

    await page.goto(best.href, { waitUntil: "domcontentloaded", timeout: 10000 });
    await sleep(500);
    const detailUrl = page.url();
    const detailName = await page.evaluate(() => {
      const ld = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of Array.from(ld)) {
        try {
          const j = JSON.parse(s.textContent ?? "");
          if (j?.name) return j.name as string;
          if (Array.isArray(j)) for (const x of j) if (x?.name) return x.name as string;
        } catch {}
      }
      return (document.querySelector("h1")?.textContent ?? "").trim();
    });
    const score2 = matchScore(wine.query, detailName);
    if (score2 < THRESHOLD) {
      return { ...wine, step: "cross", score1: best.score, score2, candidateText: best.text, detailName, detailUrl };
    }
    // 통합 가드 (품종/빈티지/스타일/와이너리)
    const guard = guardWine(detailName, wine.grapes, wine.vintage, wine.style, wine.wineryEn);
    if (!guard.pass) {
      return { ...wine, step: "guard", score1: best.score, score2, candidateText: best.text, detailName, detailUrl, guardReason: guard.reason };
    }
    return { ...wine, step: "ok", score1: best.score, score2, candidateText: best.text, detailName, detailUrl };
  } catch (e) {
    return { ...wine, step: "browser", error: (e as Error).message.slice(0, 200) };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ─── 메인 ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🎯 Vivino 재매칭 파일럿`);
  console.log(`   LIMIT=${LIMIT}, OFFSET=${OFFSET}, THRESHOLD=${THRESHOLD}\n`);

  // 대상 fetch (offset으로 샘플링, 재현성 위해 offset 인자 지원)
  const { data: rows, error } = await sb.from("raw_wines")
    .select("id, name_en, raw_payload")
    .eq("source", "wine21")
    .is("raw_payload->>vivino_url", null)
    .not("raw_payload->>parsed_search_query", "is", null)
    .neq("raw_payload->>parsed_search_query", "")
    .order("id", { ascending: true })
    .range(OFFSET, OFFSET + LIMIT - 1);
  if (error) throw error;
  if (!rows || rows.length === 0) {
    console.error("대상 없음");
    return;
  }
  console.log(`   로드 ${rows.length}건 처리 시작\n`);

  const wines = rows.map((r) => {
    const p = r.raw_payload as Record<string, unknown>;
    return {
      id: r.id,
      name_en: r.name_en as string,
      query: (p.parsed_search_query as string) ?? "",
      grapes: (p.parsed_grape_varieties as string[]) ?? [],
      vintage: (p.parsed_vintage as number | null) ?? null,
      style: (p.parsed_wine_style as string | null) ?? null,
      wineryEn: ((p.winery_en_clean as string | null) ?? (p.winery_en as string | null)) ?? null,
    };
  }).filter((w) => w.query);

  const results: Result[] = [];
  const start = Date.now();
  const stepCount: Record<Step, number> = { browser: 0, search: 0, match: 0, cross: 0, guard: 0, ok: 0 };

  for (let i = 0; i < wines.length; i++) {
    const w = wines[i];
    const elapsed = (Date.now() - start) / 1000;
    const avg = i > 0 ? elapsed / i : 0;
    process.stdout.write(`\r  [${i + 1}/${wines.length}] avg=${avg.toFixed(1)}s/건 ok=${stepCount.ok} guard=${stepCount.guard} match=${stepCount.match} cross=${stepCount.cross} noRes=${stepCount.search} err=${stepCount.browser}    `);
    const r = await tryMatch(w);
    results.push(r);
    stepCount[r.step]++;
    // Ban 조기 감지: 최근 20건 중 15건+ 실패면 중단
    if (i >= 20) {
      const recent = results.slice(-20);
      const fails = recent.filter((x) => x.step === "browser" || x.step === "search").length;
      if (fails >= 15) {
        console.log("\n\n🛑 Ban 의심 — 조기 중단");
        break;
      }
    }
    await jitter(1500, 500);
  }

  const done = results.length;
  const okCount = stepCount.ok;
  const totalTime = (Date.now() - start) / 1000;

  console.log(`\n\n========== 결과 ==========`);
  console.log(`처리: ${done}/${wines.length} (${(totalTime / 60).toFixed(1)}분)`);
  console.log(`성공: ${okCount}/${done} (${((okCount / done) * 100).toFixed(1)}%)`);
  console.log(`step별 분포:`);
  console.log(`  ok (최종 성공): ${stepCount.ok}`);
  console.log(`  guard (품종/빈티지 충돌로 reject): ${stepCount.guard}`);
  console.log(`  cross (2차 교차 실패): ${stepCount.cross}`);
  console.log(`  match (1차 매칭 실패): ${stepCount.match}`);
  console.log(`  search (autocomplete 결과 없음): ${stepCount.search}`);
  console.log(`  browser (브라우저 에러): ${stepCount.browser}`);

  console.log(`\n========== 성공 샘플 (상위 10) ==========`);
  const okSamples = results.filter((r) => r.step === "ok").slice(0, 10);
  for (const r of okSamples) {
    console.log(`  "${r.name_en.slice(0, 50)}" → q="${r.query}" winery="${r.wineryEn ?? "-"}" grapes=[${r.grapes.join(",")}] v=${r.vintage ?? "-"} style=${r.style ?? "-"}`);
    console.log(`    detail: "${r.detailName?.slice(0, 60)}" s1=${r.score1?.toFixed(2)} s2=${r.score2?.toFixed(2)}`);
  }

  console.log(`\n========== guard reject 샘플 (상위 15) ==========`);
  const guardFails = results.filter((r) => r.step === "guard").slice(0, 15);
  for (const r of guardFails) {
    console.log(`  "${r.name_en.slice(0, 50)}" winery="${r.wineryEn ?? "-"}" grapes=[${r.grapes.join(",")}] v=${r.vintage ?? "-"} style=${r.style ?? "-"}`);
    console.log(`    detail: "${r.detailName?.slice(0, 60)}" reason=${r.guardReason}`);
  }

  console.log(`\n========== match 실패 샘플 (상위 10) ==========`);
  const matchFails = results.filter((r) => r.step === "match").slice(0, 10);
  for (const r of matchFails) {
    console.log(`  "${r.name_en.slice(0, 50)}" q="${r.query}" → 후보="${r.candidateText?.slice(0, 60)}" score=${r.score1?.toFixed(2)}`);
  }

  console.log(`\n========== cross 실패 샘플 (상위 10) ==========`);
  const crossFails = results.filter((r) => r.step === "cross").slice(0, 10);
  for (const r of crossFails) {
    console.log(`  "${r.name_en.slice(0, 50)}" q="${r.query}"`);
    console.log(`    detail: "${r.detailName?.slice(0, 60)}" s1=${r.score1?.toFixed(2)} s2=${r.score2?.toFixed(2)}`);
  }
}

main().catch((e) => {
  console.error("\n❌", e);
  process.exit(1);
});
