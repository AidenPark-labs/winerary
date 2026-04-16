/**
 * wine21.com 전체 와인 목록 수집 v2 (AJAX 직접 호출)
 *
 * v1 (collect-wine21.ts) 대비:
 *   - puppeteer 폐기 → HTTP POST만 사용
 *   - WINE_TYPE × WINE_NATION 청크 분할 폐기 (전수 페이지네이션)
 *   - 5초 sleep + 더보기 클릭 폐기 → 1초 간격
 *   - 추출 필드 5개 → 8개 컬럼 + raw_payload 풍부화
 *
 * 발견:
 *   /13_search/proc/proc_wine_list_more.php 가 모든 필드를 JSON으로 반환.
 *   템플릿은 일부만 렌더링하지만 응답엔 wine_type / nation / area / alcohol /
 *   temperature / use_type / vintage / price / rating 등이 함께 들어있음.
 *
 * 추출 매핑:
 *   raw_wines 컬럼:
 *     source           = 'wine21'
 *     source_id        = dWINE_IDX
 *     name_ko          = mergeName(strWINE_KNAME)
 *     name_en          = mergeName(strWINE_ENAME)
 *     producer_ko      = strWINERY_KNAME
 *     producer_en      = strWINERY_ENAME
 *     producer         = strWINERY_KNAME (legacy 호환)
 *     wine_type        = normalize(strWINE_TYPE_NAME)  -- red/white/rose/...
 *     country          = strNATION_NAME 한글부 (예: "호주")
 *     region           = strAREA_KNAME
 *
 *   raw_payload (JSONB):
 *     wine_idx, winery_idx, area_idx, area_code
 *     nation_name_full ("호주(Australia)")
 *     area_ename
 *     wine_type_name_ko, wine_type_css
 *     alcohol_range ("12~13"), temperature ("10-12"), use_type, vintage,
 *     price_text ("0원" 등), capacity_ml, total_point, tasting_count,
 *     hash_tag, taste, image_path, create_date, update_date
 *
 * 저장 안 함:
 *   - strIMAGE_PATH 는 이미지 자체에 "WINE21.COM" 워터마크가 박혀 있어
 *     wines.image_url 에 절대 넣지 않음 (raw_payload.image_path 만 보관)
 *   - strALCOHOL 은 "12~13" 형태 range — wines.alcohol numeric(4,1) 에 직접 저장 X.
 *     정확한 % 는 추후 Vivino 보강에서 채움.
 *
 * 실행:
 *   npx tsx scripts/collect-wine21-v2.ts                    # 전체 (1페이지부터)
 *   npx tsx scripts/collect-wine21-v2.ts --resume            # 체크포인트부터
 *   npx tsx scripts/collect-wine21-v2.ts --start=100         # 특정 페이지부터
 *   npx tsx scripts/collect-wine21-v2.ts --pages=10          # 최대 N페이지만
 *   npx tsx scripts/collect-wine21-v2.ts --delay=1500        # 요청 간격 ms
 *   npx tsx scripts/collect-wine21-v2.ts --page-size=50      # 페이지당 건수
 *   npx tsx scripts/collect-wine21-v2.ts --dry-run           # DB 저장 안 함
 */

import { config } from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "fs";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ .env.local 환경변수 확인 필요 (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(1);
}

const ENDPOINT = "https://www.wine21.com/13_search/proc/proc_wine_list_more.php";
const REFERER = "https://www.wine21.com/13_search/wine_list.html";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// 빈 필터 base64 — 와인 검색 페이지 기본값 그대로
const EMPTY_MAIN_FILTER =
  "eyJXSU5FX1RZUEUiOltdLCJXSU5FX05BVElPTiI6W10sIldJTkVfUFJJQ0UiOltdLCJXSU5FX0ZPT0QiOltdLCJXSU5FX1RBU1RFX1NXRUVUIjowLCJXSU5FX1RBU1RFX0FDSURJVFkiOjAsIldJTkVfVEFTVEVfQk9EWSI6MCwiV0lORV9UQVNURV9UQU5OSU4iOjAsIktFWVdPUkQiOiIiLCJXSU5FX1ZBUklFVFkiOltdfQ==";

const CHECKPOINT_PATH = "/tmp/wine21_v2_checkpoint.json";

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
const START_PAGE = parseInt(argValue("start") || "1", 10);
const MAX_PAGES = argValue("pages") ? parseInt(argValue("pages")!, 10) : Infinity;
const DELAY_MS = parseInt(argValue("delay") || "1000", 10);
const PAGE_SIZE = parseInt(argValue("page-size") || "50", 10);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── 타입 ──────────────────────────────────────────────────────────────────

interface RawItem {
  Number: number;
  dWINE_IDX: number;
  strIMAGE_PATH: string;
  strWINE_KNAME: string;
  strWINE_ENAME: string;
  dWINERY_INFO_IDX: number;
  strWINERY_KNAME: string;
  strWINERY_ENAME: string;
  dAREA_INFO_IDX: number;
  dAREA_CODE: string;
  strFLAG_PATH: string;
  strNATION_NAME: string;
  strAREA_KNAME: string;
  strAREA_ENAME: string;
  strVARIETY_NAME: string;
  strWINE_TYPE_NAME: string;
  strWINE_TYPE_CSS: string;
  strUSE_TYPE: string;
  strALCOHOL: string;
  strTEMPERATURE: string;
  strTASTE: string;
  dVINTAGE: string | number;
  strPACKING_NAME: string;
  strPACKING_CSS: string;
  dCAPACITY: number;
  strPRICE: string;
  strTOTAL_POINT: string;
  dTASTINGPOINT_CNT: number;
  strHASH_TAG: string;
  dCREATE_DATE: string;
  dUPDATE_DATE: string;
}

interface ApiResponse {
  status: string;
  moreFlag: boolean | string;
  totalCnt: number;
  listData: RawItem[];
}

interface RawWinePayload {
  source: "wine21";
  source_id: string;
  name_ko: string;
  name_en: string | null;
  producer: string | null;
  producer_ko: string | null;
  producer_en: string | null;
  wine_type: string | null;
  country: string | null;
  region: string | null;
  raw_payload: Record<string, unknown>;
}

interface Checkpoint {
  lastDonePage: number;
  totalCnt: number;
  totalSaved: number;
  startedAt: string;
  updatedAt: string;
}

// ─── 정규화 ────────────────────────────────────────────────────────────────

function mergeName(s: string | null | undefined): string {
  return (s || "").replace(/\u00a0/g, " ").replace(/,\s*/g, " ").replace(/\s+/g, " ").trim();
}

function clean(s: string | null | undefined): string {
  return (s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

const WINE_TYPE_MAP: Record<string, string> = {
  "레드": "red",
  "화이트": "white",
  "스파클링": "sparkling",
  "로제": "rose",
  "주정강화": "fortified",
  "디저트": "dessert",
  "기타": "other",
};

function normalizeWineType(s: string): string | null {
  const k = clean(s);
  return WINE_TYPE_MAP[k] ?? (k ? "other" : null);
}

// "호주(Australia)" → "호주"
function extractCountryKo(s: string): string | null {
  const c = clean(s);
  if (!c) return null;
  const m = c.match(/^([^(（]+)/);
  return m ? m[1].trim() : c;
}

function nullIfEmpty(v: unknown): unknown {
  if (v === null || v === undefined || v === false) return null;
  const s = String(v).trim();
  if (s === "" || s === "-" || s === "NA" || s === "None" || s === "false") return null;
  return s;
}

// ─── 변환 ──────────────────────────────────────────────────────────────────

function toPayload(item: RawItem): RawWinePayload | null {
  const sourceId = String(item.dWINE_IDX || "").trim();
  const nameKo = mergeName(item.strWINE_KNAME);
  if (!sourceId || !nameKo) return null;

  const wineryKo = clean(item.strWINERY_KNAME) || null;
  const wineryEn = clean(item.strWINERY_ENAME) || null;

  return {
    source: "wine21",
    source_id: sourceId,
    name_ko: nameKo,
    name_en: mergeName(item.strWINE_ENAME) || null,
    producer: wineryKo,
    producer_ko: wineryKo,
    producer_en: wineryEn,
    wine_type: normalizeWineType(item.strWINE_TYPE_NAME),
    country: extractCountryKo(item.strNATION_NAME),
    region: clean(item.strAREA_KNAME) || null,
    raw_payload: {
      wine_idx: sourceId,
      winery_idx: item.dWINERY_INFO_IDX || null,
      area_idx: item.dAREA_INFO_IDX || null,
      area_code: nullIfEmpty(item.dAREA_CODE),
      nation_name_full: nullIfEmpty(item.strNATION_NAME),
      area_ename: nullIfEmpty(item.strAREA_ENAME),
      winery_ko: wineryKo,
      winery_en: wineryEn,
      wine_type_name_ko: nullIfEmpty(item.strWINE_TYPE_NAME),
      wine_type_css: nullIfEmpty(item.strWINE_TYPE_CSS),
      alcohol_range: nullIfEmpty(item.strALCOHOL),
      temperature: nullIfEmpty(item.strTEMPERATURE),
      use_type: nullIfEmpty(item.strUSE_TYPE),
      vintage: nullIfEmpty(item.dVINTAGE),
      price_text: nullIfEmpty(item.strPRICE),
      capacity_ml: item.dCAPACITY || null,
      total_point: nullIfEmpty(item.strTOTAL_POINT),
      tasting_count: item.dTASTINGPOINT_CNT || 0,
      hash_tag: nullIfEmpty(item.strHASH_TAG),
      taste: nullIfEmpty(item.strTASTE),
      image_path: nullIfEmpty(item.strIMAGE_PATH), // 워터마크 — 표시용 X
      create_date: nullIfEmpty(item.dCREATE_DATE),
      update_date: nullIfEmpty(item.dUPDATE_DATE),
      collected_via: "v2_ajax",
    },
  };
}

// ─── 체크포인트 ─────────────────────────────────────────────────────────────

function loadCheckpoint(): Checkpoint {
  if (RESUME && existsSync(CHECKPOINT_PATH)) {
    const cp = JSON.parse(readFileSync(CHECKPOINT_PATH, "utf-8")) as Checkpoint;
    console.log(`📂 체크포인트: lastDonePage=${cp.lastDonePage}, 누적 ${cp.totalSaved}건`);
    return cp;
  }
  return {
    lastDonePage: 0,
    totalCnt: 0,
    totalSaved: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function saveCheckpoint(cp: Checkpoint) {
  cp.updatedAt = new Date().toISOString();
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2));
}

// ─── HTTP ──────────────────────────────────────────────────────────────────

async function fetchRaw(page: number, pageSize: number): Promise<{ ok: boolean; status: number; body: string }> {
  const body = new URLSearchParams({
    shCate: "",
    shKeyword: "",
    shOrder: "a.CREATE_DATE|DESC",
    Idx: "",
    rPage: String(page),
    rPageSize: String(pageSize),
    rMainFilter: EMPTY_MAIN_FILTER,
    rListQuery: "",
  });

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "X-Requested-With": "XMLHttpRequest",
      Referer: REFERER,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Accept: "application/json, text/javascript, */*; q=0.01",
    },
    body: body.toString(),
  });

  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text };
}

function parseResponse(text: string): ApiResponse {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return JSON.parse(clean) as ApiResponse;
}

async function fetchPage(page: number, pageSize: number): Promise<ApiResponse> {
  const r = await fetchRaw(page, pageSize);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.body.slice(0, 200)}`);
  return parseResponse(r.body);
}

/**
 * 페이지 전체가 500이면 wine21 DB에 깨진 행이 끼어있다는 뜻.
 * 같은 구간을 pageSize=1 로 1건씩 재시도해 살아있는 행만 회수한다.
 */
async function recoverPage(page: number, pageSize: number): Promise<{ items: RawItem[]; broken: number[] }> {
  const startOffset = (page - 1) * pageSize + 1;
  const items: RawItem[] = [];
  const broken: number[] = [];

  for (let i = 0; i < pageSize; i++) {
    const offset = startOffset + i;
    try {
      const r = await fetchRaw(offset, 1);
      if (!r.ok) {
        broken.push(offset);
        await sleep(500);
        continue;
      }
      const parsed = parseResponse(r.body);
      if (parsed.status === "OK" && parsed.listData?.length) {
        items.push(...parsed.listData);
      }
    } catch {
      broken.push(offset);
    }
    await sleep(500);
  }
  return { items, broken };
}

async function upsertBatch(payloads: RawWinePayload[]): Promise<number> {
  if (payloads.length === 0) return 0;
  if (DRY_RUN) {
    console.log(`  [dry-run] ${payloads.length}건 저장 스킵`);
    return payloads.length;
  }
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
    throw new Error(`upsert ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return payloads.length;
}

// ─── 메인 ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("🍷 wine21 v2 수집 시작 (AJAX)");
  console.log(`   START_PAGE=${START_PAGE}, PAGE_SIZE=${PAGE_SIZE}, DELAY=${DELAY_MS}ms, RESUME=${RESUME}, DRY=${DRY_RUN}`);
  if (MAX_PAGES !== Infinity) console.log(`   MAX_PAGES=${MAX_PAGES}`);

  const cp = loadCheckpoint();
  let page = RESUME && cp.lastDonePage > 0 ? cp.lastDonePage + 1 : START_PAGE;

  const start = Date.now();
  let pagesProcessed = 0;

  let totalBroken = 0;

  while (pagesProcessed < MAX_PAGES) {
    let resp: ApiResponse | null = null;
    let recoveredItems: RawItem[] | null = null;

    try {
      resp = await fetchPage(page, PAGE_SIZE);
    } catch (e: any) {
      console.error(`\n⚠ page=${page} 실패: ${e.message.slice(0, 120)}`);
      console.error(`   재시도 5초 후...`);
      await sleep(5000);
      try {
        resp = await fetchPage(page, PAGE_SIZE);
      } catch (e2: any) {
        console.error(`   재시도 실패: ${e2.message.slice(0, 80)}`);
        console.error(`   → pageSize=1 fallback 으로 ${PAGE_SIZE}건 개별 회수 시도...`);
        const rec = await recoverPage(page, PAGE_SIZE);
        recoveredItems = rec.items;
        totalBroken += rec.broken.length;
        console.error(`   회수 ${rec.items.length}건 / 손실 ${rec.broken.length}건 (offset: ${rec.broken.join(",")})`);
        if (rec.items.length === 0 && rec.broken.length === PAGE_SIZE) {
          console.error(`   ❌ 페이지 전체 실패 — 종료`);
          saveCheckpoint(cp);
          process.exit(1);
        }
      }
    }

    if (resp && resp.status !== "OK") {
      console.error(`\n❌ status=${resp.status}, 종료`);
      break;
    }

    if (resp && (page === START_PAGE || cp.totalCnt === 0)) {
      cp.totalCnt = resp.totalCnt;
      console.log(`   서버 totalCnt=${resp.totalCnt}, 예상 페이지=${Math.ceil(resp.totalCnt / PAGE_SIZE)}`);
    }

    const items: RawItem[] = recoveredItems ?? resp?.listData ?? [];
    if (items.length === 0 && !recoveredItems) {
      console.log(`\n📭 page=${page} 빈 응답 — 종료`);
      break;
    }

    const payloads = items
      .map(toPayload)
      .filter((p): p is RawWinePayload => p !== null);

    let saved = 0;
    try {
      saved = await upsertBatch(payloads);
    } catch (e: any) {
      console.error(`\n❌ upsert 실패 page=${page}: ${e.message}`);
      saveCheckpoint(cp);
      process.exit(1);
    }

    cp.totalSaved += saved;
    cp.lastDonePage = page;
    saveCheckpoint(cp);

    const elapsed = (Date.now() - start) / 1000;
    const rate = pagesProcessed > 0 ? elapsed / (pagesProcessed + 1) : 0;
    const remainingPages = Math.max(0, Math.ceil(cp.totalCnt / PAGE_SIZE) - page);
    const eta = remainingPages * (rate || (DELAY_MS + 500) / 1000);
    process.stdout.write(
      `\r  page=${page} 저장=${saved}/${items.length} 누적=${cp.totalSaved} ETA=${Math.round(eta)}s    `
    );

    // moreFlag 가 false 면 종료 (recoveredItems 경로는 resp 없음 → 계속)
    if (resp) {
      const more = resp.moreFlag === true || resp.moreFlag === "true";
      if (!more) {
        console.log(`\n📭 moreFlag=false at page=${page} — 종료`);
        break;
      }
    }

    page += 1;
    pagesProcessed += 1;
    await sleep(DELAY_MS);
  }

  const elapsed = (Date.now() - start) / 1000;
  console.log(`\n\n🎉 완료: ${cp.totalSaved}건 / ${pagesProcessed + 1} 페이지 / ${elapsed.toFixed(0)}s`);
  if (totalBroken > 0) console.log(`   ⚠ wine21 깨진 행 ${totalBroken}건 손실`);
  console.log(`   체크포인트: ${CHECKPOINT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
