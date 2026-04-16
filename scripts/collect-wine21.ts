/**
 * wine21.com 전체 와인 목록 수집 (청크 기반)
 *
 * 전략:
 *   WINE_TYPE(6) × WINE_NATION(12) = 72개 청크로 분할
 *   각 청크: 필터 적용 → 더보기 반복 → 청크 완료
 *   청크 체크포인트로 재개 (실패 시 그 청크만 재실행, 약 4분 손실)
 *
 * 수집 필드 (4개로 한정):
 *   - name_ko, name_en (콤마→공백 머지)
 *   - producer_ko, producer_en
 *   - source_id (wine_idx)
 *
 * 가이드라인:
 *   - 요청 간격 5초 이상
 *   - 일반 브라우저 UA
 *   - 텍스트 필드만 (이미지/설명/평점/가격 미수집)
 *
 * 실행:
 *   npx tsx scripts/collect-wine21.ts                # 전체 72청크
 *   npx tsx scripts/collect-wine21.ts --resume       # 미완료 청크부터
 *   npx tsx scripts/collect-wine21.ts --chunks=W01004:P09000000,W01002:P15000000
 */

import { config } from "dotenv";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { existsSync, readFileSync, writeFileSync } from "fs";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ .env.local 환경변수 확인 필요");
  process.exit(1);
}

const LIST_URL = "https://www.wine21.com/13_search/wine_list.html";
const SLEEP_BETWEEN_CLICKS_MS = 5000;
const FILTER_WAIT_MS = 3000;
const PAGE_SIZE = 100; // 기본 10 → 100 (페이지 기반 캡 우회 시도)
const CHECKPOINT_PATH = "/tmp/wine21_chunks.json";

// ─── 청크 정의 ─────────────────────────────────────────────────────────────

const WINE_TYPES: Array<{ code: string; name: string }> = [
  { code: "W01004", name: "레드" },
  { code: "W01002", name: "화이트" },
  { code: "W01001", name: "스파클링" },
  { code: "W01003", name: "로제" },
  { code: "W01005", name: "주정강화" },
  { code: "W01999", name: "기타" },
];

const WINE_NATIONS: Array<{ code: string; name: string }> = [
  { code: "P09000000", name: "프랑스" },
  { code: "P15000000", name: "이탈리아" },
  { code: "P24000000", name: "스페인" },
  { code: "P19000000", name: "포르투갈" },
  { code: "P11000000", name: "독일" },
  { code: "P28000000", name: "미국" },
  { code: "P18000000", name: "뉴질랜드" },
  { code: "P02000000", name: "호주" },
  { code: "P08000000", name: "칠레" },
  { code: "P01000000", name: "아르헨티나" },
  { code: "P23000000", name: "남아프리카 공화국" },
  { code: "P99000000", name: "기타국가" },
];

interface Chunk {
  typeCode: string;
  typeName: string;
  nationCode: string;
  nationName: string;
  key: string;
}

const ALL_CHUNKS: Chunk[] = WINE_TYPES.flatMap((t) =>
  WINE_NATIONS.map((n) => ({
    typeCode: t.code,
    typeName: t.name,
    nationCode: n.code,
    nationName: n.name,
    key: `${t.code}:${n.code}`,
  }))
);

// ─── CLI ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const RESUME = args.includes("--resume");
const CHUNKS_ARG = args.find((a) => a.startsWith("--chunks="));
const CHUNK_FILTER = CHUNKS_ARG
  ? new Set(CHUNKS_ARG.split("=")[1].split(","))
  : null;

// ─── 타입 ──────────────────────────────────────────────────────────────────

interface Wine {
  source_id: string;
  name_ko: string;
  name_en: string;
  producer_ko: string;
  producer_en: string;
}

interface Checkpoint {
  // chunk key → { status, savedCount, finishedAt }
  chunks: Record<
    string,
    { status: "done" | "in_progress" | "failed"; saved: number; at: string; error?: string }
  >;
  totalSaved: number;
  startedAt: string;
  updatedAt: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── 체크포인트 ─────────────────────────────────────────────────────────────

function loadCheckpoint(): Checkpoint {
  if (RESUME && existsSync(CHECKPOINT_PATH)) {
    const cp = JSON.parse(readFileSync(CHECKPOINT_PATH, "utf-8"));
    const done = Object.values(cp.chunks).filter((c: any) => c.status === "done").length;
    console.log(`📂 체크포인트: ${done}/${ALL_CHUNKS.length} 청크 완료, 누적 ${cp.totalSaved}건\n`);
    return cp;
  }
  return {
    chunks: {},
    totalSaved: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function saveCheckpoint(cp: Checkpoint) {
  cp.updatedAt = new Date().toISOString();
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2));
}

// ─── 추출 스크립트 (브라우저 컨텍스트) ──────────────────────────────────────

const EXTRACT_SCRIPT = `
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
  function mergeName(s) {
    return (s || "").replace(/,\\s*/g, " ").replace(/\\s+/g, " ").trim();
  }
  var items = Array.prototype.slice.call(document.querySelectorAll("#wine_list li"));
  return items.map(function(li) {
    var thumbA = li.querySelector(".thumb a");
    var sourceId = "";
    if (thumbA) {
      var href = thumbA.getAttribute("href") || "";
      var m = href.match(/goWineViewWithParam\\((\\d+)\\)/);
      if (m) sourceId = m[1];
    }
    var wineryRaw = (li.querySelector(".winery a") && li.querySelector(".winery a").textContent || "").trim();
    var w = splitWinery(wineryRaw);
    var btnView = li.querySelector("h3 .btnView");
    var name_ko_raw = "";
    if (btnView) {
      var nodes = Array.prototype.slice.call(btnView.childNodes);
      name_ko_raw = norm(
        nodes.filter(function(n) { return n.nodeType === 3; })
             .map(function(n) { return n.textContent || ""; })
             .join(" ")
      );
    }
    var enEl = li.querySelector(".wine-name-en");
    var name_en_raw = norm(enEl && enEl.textContent || "");
    return {
      source_id: sourceId,
      name_ko: mergeName(name_ko_raw),
      name_en: mergeName(name_en_raw),
      producer_ko: w.ko,
      producer_en: w.en
    };
  });
})()
`;

async function extractWines(page: Page): Promise<Wine[]> {
  return (await page.evaluate(EXTRACT_SCRIPT)) as Wine[];
}

// ─── DB 적재 ───────────────────────────────────────────────────────────────

async function upsertBatch(wines: Wine[]): Promise<number> {
  if (wines.length === 0) return 0;
  const payloads = wines
    .filter((w) => w.source_id && w.name_ko)
    .map((w) => ({
      source: "wine21",
      source_id: w.source_id,
      name_ko: w.name_ko,
      name_en: w.name_en || null,
      producer: w.producer_ko || null,
      producer_ko: w.producer_ko || null,
      producer_en: w.producer_en || null,
      raw_payload: {
        wine_idx: w.source_id,
        winery_ko: w.producer_ko,
        winery_en: w.producer_en,
      },
    }));
  if (payloads.length === 0) return 0;

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/raw_wines?on_conflict=source,source_id`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(payloads),
    }
  );
  if (!res.ok) {
    console.error(`  ⚠ 배치 저장 실패 (${res.status}):`, (await res.text()).slice(0, 200));
    return 0;
  }
  return payloads.length;
}

// ─── 브라우저 ──────────────────────────────────────────────────────────────

async function launch(): Promise<{ browser: Browser; page: Page }> {
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );
  await page.setViewport({ width: 1280, height: 900 });
  return { browser, page };
}

async function loadFreshList(page: Page) {
  // 쿠키 클리어 (이전 청크의 LQ_WL이 남아있으면 필터 상태가 꼬임)
  const client = await page.createCDPSession();
  await client.send("Network.clearBrowserCookies");
  await page.goto(LIST_URL, { waitUntil: "networkidle2", timeout: 30000 });
  await page.waitForFunction(
    () =>
      (document.getElementById("wine_list")?.querySelectorAll("li").length ?? 0) > 0 ||
      document.getElementById("wine_list_no")?.style.display === "block",
    { timeout: 15000 }
  );
}

async function applyFilter(page: Page, type: "WINE_TYPE" | "WINE_NATION", code: string) {
  // 체크박스 input의 value 속성으로 정확 매칭
  const ok = await page.evaluate(
    (filterType, filterCode) => {
      const inputs = Array.from(
        document.querySelectorAll('input[type="checkbox"]')
      ) as HTMLInputElement[];
      const match = inputs.find((el) => {
        const onclick = el.getAttribute("onclick") || "";
        return (
          el.value === filterCode &&
          onclick.includes(`'${filterType}'`)
        );
      });
      if (!match) return false;
      match.click();
      return true;
    },
    type,
    code
  );
  if (!ok) throw new Error(`필터 체크박스 못 찾음: ${type}=${code}`);
  await sleep(FILTER_WAIT_MS);
}

async function clickMore(page: Page): Promise<boolean> {
  const moreVisible = await page.evaluate(() => {
    const btn = document.getElementById("wineListMoreBtn");
    if (!btn) return false;
    return window.getComputedStyle(btn).display !== "none";
  });
  if (!moreVisible) return false;

  const before = await page.evaluate(
    () => document.querySelectorAll("#wine_list li").length
  );
  await page.evaluate(() => {
    (document.getElementById("wineListMoreBtn") as HTMLElement | null)?.click();
  });
  try {
    await page.waitForFunction(
      (prev) => document.querySelectorAll("#wine_list li").length > prev,
      { timeout: 15000 },
      before
    );
    return true;
  } catch {
    return false;
  }
}

async function getTotalCount(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const el = document.getElementById("lblTotalCount");
    if (!el) return 0;
    const m = (el.textContent || "").match(/\d[\d,]*/);
    return m ? parseInt(m[0].replace(/,/g, ""), 10) : 0;
  });
}

// ─── 청크 처리 ─────────────────────────────────────────────────────────────

async function processChunk(page: Page, chunk: Chunk): Promise<number> {
  console.log(`\n━━ ${chunk.typeName} × ${chunk.nationName} (${chunk.key}) ━━`);

  await loadFreshList(page);
  // pageSize 오버라이드 (서버가 받아들이면 페이지 기반 캡 우회 가능)
  await page.evaluate((size) => {
    (window as any).m_searchOption.pageSize = size;
  }, PAGE_SIZE);
  await applyFilter(page, "WINE_TYPE", chunk.typeCode);
  await applyFilter(page, "WINE_NATION", chunk.nationCode);

  const total = await getTotalCount(page);
  console.log(`  총 ${total}건`);

  if (total === 0) return 0;

  const seen = new Set<string>();
  let lastDom = 0;
  let chunkSaved = 0;
  const start = Date.now();

  while (true) {
    const all = await extractWines(page);
    const fresh: Wine[] = [];
    for (let i = lastDom; i < all.length; i++) {
      const w = all[i];
      if (!w.source_id || seen.has(w.source_id)) continue;
      seen.add(w.source_id);
      fresh.push(w);
    }
    lastDom = all.length;

    if (fresh.length > 0) {
      const saved = await upsertBatch(fresh);
      chunkSaved += saved;
      const pct = total > 0 ? ((chunkSaved / total) * 100).toFixed(0) : "?";
      process.stdout.write(`\r  진행 ${chunkSaved}/${total} (${pct}%)`);
    }

    if (chunkSaved >= total) break;

    await sleep(SLEEP_BETWEEN_CLICKS_MS);
    const more = await clickMore(page);
    if (!more) break;
  }

  console.log(
    `\n  ✅ ${chunkSaved}건 / ${((Date.now() - start) / 1000).toFixed(0)}s`
  );
  return chunkSaved;
}

// ─── 메인 ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("🍷 wine21 청크 크롤 시작");
  console.log(`   총 청크: ${ALL_CHUNKS.length}, resume=${RESUME}`);
  if (CHUNK_FILTER) console.log(`   필터: ${Array.from(CHUNK_FILTER).join(",")}`);

  const cp = loadCheckpoint();
  const pending = ALL_CHUNKS.filter((c) => {
    if (CHUNK_FILTER && !CHUNK_FILTER.has(c.key)) return false;
    if (RESUME && cp.chunks[c.key]?.status === "done") return false;
    return true;
  });
  console.log(`   처리할 청크: ${pending.length}\n`);

  const { browser, page } = await launch();
  const start = Date.now();

  try {
    for (let i = 0; i < pending.length; i++) {
      const chunk = pending[i];
      console.log(`\n[${i + 1}/${pending.length}] ${chunk.typeName} × ${chunk.nationName}`);

      cp.chunks[chunk.key] = { status: "in_progress", saved: 0, at: new Date().toISOString() };
      saveCheckpoint(cp);

      try {
        const saved = await processChunk(page, chunk);
        cp.chunks[chunk.key] = {
          status: "done",
          saved,
          at: new Date().toISOString(),
        };
        cp.totalSaved += saved;
        saveCheckpoint(cp);

        const elapsed = (Date.now() - start) / 1000 / 60;
        const remaining = pending.length - i - 1;
        const eta = remaining > 0 ? (elapsed / (i + 1)) * remaining : 0;
        console.log(`   누적 ${cp.totalSaved}건 / 경과 ${elapsed.toFixed(1)}분 / ETA ${eta.toFixed(0)}분`);
      } catch (e: any) {
        console.error(`   ❌ 청크 실패: ${e.message}`);
        cp.chunks[chunk.key] = {
          status: "failed",
          saved: 0,
          at: new Date().toISOString(),
          error: e.message,
        };
        saveCheckpoint(cp);
        // 청크 하나 실패해도 다음으로 진행
      }
    }

    console.log(`\n🎉 전체 완료: ${cp.totalSaved}건`);
    const failed = Object.entries(cp.chunks).filter(([, v]) => v.status === "failed");
    if (failed.length > 0) {
      console.log(`⚠ 실패 청크 ${failed.length}개:`);
      failed.forEach(([k, v]) => console.log(`   ${k}: ${v.error}`));
      console.log(`   → npx tsx scripts/collect-wine21.ts --resume 으로 재시도`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
