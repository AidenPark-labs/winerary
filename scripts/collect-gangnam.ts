/**
 * 강남와인(gangnam.wine) 와인 수집 스크립트
 *
 * 실행: npx tsx scripts/collect-gangnam.ts
 *
 * 1단계: 카테고리별 목록 페이지에서 와인 기본정보 수집 (branduid, 한글명, 가격, 이미지)
 * 2단계: 상세 페이지에서 영문명, 국가/지역, 품종, 도수, 설명 등 보강
 * 3단계: Supabase wines 테이블에 upsert (data_source = "gangnam")
 */

import { config } from "dotenv";

config({ path: ".env.local" });

// ─── 환경변수 ────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ .env.local 환경변수를 확인하세요 (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(1);
}

// ─── 설정 ────────────────────────────────────────────────────────────────────

const BASE_URL = "https://www.gangnam.wine";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// 카테고리 mcode 매핑 (확인된 것 + 005/007은 실험적으로 시도)
// wines.wine_type CHECK 제약: red/white/rose/sparkling/fortified/dessert/other
// 내추럴은 별도 타입이 없어 other로 저장
const WINE_CATEGORIES: Record<string, { mcode: string; wineType: string }> = {
  레드: { mcode: "001", wineType: "red" },
  화이트: { mcode: "002", wineType: "white" },
  내추럴: { mcode: "003", wineType: "other" },
  스파클링: { mcode: "004", wineType: "sparkling" },
  "기타5": { mcode: "005", wineType: "other" },
  로제: { mcode: "006", wineType: "rose" },
  "기타7": { mcode: "007", wineType: "other" },
};

const LIST_SLEEP_MS = 300;
const DETAIL_SLEEP_MS = 200;

// SAMPLE_LIMIT 환경변수가 설정되면 해당 개수만 수집 후 종료 (테스트용)
const SAMPLE_LIMIT = process.env.SAMPLE_LIMIT ? parseInt(process.env.SAMPLE_LIMIT) : 0;

// ─── 타입 ────────────────────────────────────────────────────────────────────

interface WineItem {
  branduid: string;
  name_ko: string;
  name_en: string | null;
  wine_type: string;
  country: string | null;
  region: string | null;
  grape_variety: string | null;
  alcohol: string | null;
  producer: string | null;
  description: string | null;
  price: number | null;
  image_url: string | null;
}

// ─── 유틸 ────────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s: string): string {
  // HTML 주석 먼저 제거 (<!-- ... -->), 그 다음 일반 태그
  return decodeEntities(
    s.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "")
  )
    .replace(/\s+/g, " ")
    .trim();
}

// ─── 1단계: 목록 페이지 파싱 ─────────────────────────────────────────────────

function parseListPage(html: string, wineType: string): WineItem[] {
  const wines: WineItem[] = [];
  const seen = new Set<string>();

  // 메인 상품 카드는 MS_prod_img_l 클래스를 가진 <img>로 시작하는 <li> 블록.
  // <img class="MS_prod_img_l ..."> 위치를 앵커로 잡고, 거기서부터 다음 동일 앵커(또는 </ul>)까지를 한 블록으로 본다.
  const anchorRe = /<img[^>]*class="[^"]*MS_prod_img_l[^"]*"[^>]*>/g;
  const anchorPositions: number[] = [];
  let am: RegExpExecArray | null;
  while ((am = anchorRe.exec(html)) !== null) {
    anchorPositions.push(am.index);
  }

  for (let i = 0; i < anchorPositions.length; i++) {
    const start = anchorPositions[i];
    const end = i + 1 < anchorPositions.length ? anchorPositions[i + 1] : start + 4000;
    const block = html.slice(start, end);

    // branduid (onClick 또는 href에서)
    const idMatch = block.match(/branduid=(\d+)/);
    if (!idMatch) continue;
    const branduid = idMatch[1];
    if (seen.has(branduid)) continue;

    // 이미지 URL
    const imgMatch = block.match(/<img[^>]+src=["']([^"']*\/shopimages\/[^"']+)["']/);
    const image_url = imgMatch ? `${BASE_URL}${imgMatch[1]}` : null;

    // 이름: <p class="name">...</p>
    const nameMatch = block.match(/<p[^>]*class="name"[^>]*>([\s\S]*?)<\/p>/);
    if (!nameMatch) continue;
    const name_ko = stripTags(nameMatch[1]);
    if (!name_ko) continue;

    // 가격: <span class="price">67,000</span>
    const priceMatch = block.match(/<span[^>]*class="price"[^>]*>([\s\S]*?)<\/span>/);
    let price: number | null = null;
    if (priceMatch) {
      const priceText = stripTags(priceMatch[1]);
      const digits = priceText.replace(/[^\d]/g, "");
      if (digits) price = parseInt(digits);
    }

    seen.add(branduid);
    wines.push({
      branduid,
      name_ko,
      name_en: null,
      wine_type: wineType,
      country: null,
      region: null,
      grape_variety: null,
      alcohol: null,
      producer: null,
      description: null,
      price,
      image_url,
    });
  }

  return wines;
}

function getTotalPages(html: string): number {
  // 페이지네이션 링크에서 page= 의 최댓값
  const matches = html.match(/[?&]page=(\d+)/g);
  if (!matches) return 1;
  const pages = matches.map((s) => parseInt(s.replace(/[?&]page=/, "")));
  return Math.max(...pages, 1);
}

async function collectFromCategory(
  categoryName: string,
  mcode: string,
  wineType: string
): Promise<WineItem[]> {
  const allWines: WineItem[] = [];
  const seenIds = new Set<string>();

  const firstUrl = `${BASE_URL}/shop/shopbrand.html?xcode=001&mcode=${mcode}&type=X&page=1`;
  let firstHtml: string;
  try {
    firstHtml = await fetchPage(firstUrl);
  } catch (err) {
    console.log(`  ⚠ ${categoryName} (mcode=${mcode}): 접근 실패, 스킵`);
    return [];
  }

  const firstWines = parseListPage(firstHtml, wineType);
  if (firstWines.length === 0) {
    console.log(`  ⏭  ${categoryName} (mcode=${mcode}): 상품 없음, 스킵`);
    return [];
  }

  const totalPages = getTotalPages(firstHtml);
  console.log(`  📄 ${categoryName}: 총 ${totalPages} 페이지`);

  for (const w of firstWines) {
    if (!seenIds.has(w.branduid)) {
      seenIds.add(w.branduid);
      allWines.push(w);
    }
  }

  for (let page = 2; page <= totalPages; page++) {
    if (SAMPLE_LIMIT > 0 && allWines.length >= SAMPLE_LIMIT) break;
    await sleep(LIST_SLEEP_MS);
    const url = `${BASE_URL}/shop/shopbrand.html?xcode=001&mcode=${mcode}&type=X&page=${page}`;
    try {
      const html = await fetchPage(url);
      const wines = parseListPage(html, wineType);
      for (const w of wines) {
        if (!seenIds.has(w.branduid)) {
          seenIds.add(w.branduid);
          allWines.push(w);
        }
      }
      process.stdout.write(`  [${page}/${totalPages}] ${allWines.length}개 수집\r`);
    } catch (err) {
      console.error(`\n  ⚠ 페이지 ${page} 실패:`, err);
    }
  }

  console.log(`\n  ✅ ${categoryName}: ${allWines.length}개 수집 완료`);
  return allWines;
}

// ─── 2단계: 상세 페이지 파싱 ─────────────────────────────────────────────────

interface DetailInfo {
  name_en: string | null;
  country: string | null;
  region: string | null;
  grape_variety: string | null;
  alcohol: string | null;
  producer: string | null;
  description: string | null;
  wine_type_hint: string | null;
  price: number | null;
}

// 강남와인 상세 페이지는 두 가지 키-값 구조를 사용한다:
//   A. <figure class="table"><td><strong>키</strong></td><td>값</td></figure> (직영 컨텐츠)
//   B. <dt>키</dt><dd>값</dd> (modu.wine 외부 컨텐츠)
// 둘 다 처리해서 하나의 key-value 맵으로 합친다.
function extractKeyValueTables(html: string): Record<string, string> {
  const result: Record<string, string> = {};

  // 구조 A: figure/table
  const figureRe = /<figure[^>]*class="[^"]*table[^"]*"[^>]*>([\s\S]*?)<\/figure>/g;
  let fm: RegExpExecArray | null;
  while ((fm = figureRe.exec(html)) !== null) {
    const inner = fm[1];
    const tds: string[] = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tdRe.exec(inner)) !== null) {
      tds.push(tm[1]);
    }
    for (let i = 0; i < tds.length - 1; i++) {
      const header = stripTags(tds[i]);
      const isHeader = /<strong>/i.test(tds[i]);
      if (!isHeader) continue;
      const value = stripTags(tds[i + 1]);
      if (header && value) {
        result[header.replace(/\s+/g, "")] = value;
      }
    }
  }

  // 구조 B: <dt>키</dt><dd>값</dd> 페어
  // 값에 <div class="progress-bar"> 같은 위젯이 있는 경우(당도/산도/바디/타닌)는 텍스트가 비므로 자동으로 걸러진다.
  const dtDdRe = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g;
  let dm: RegExpExecArray | null;
  while ((dm = dtDdRe.exec(html)) !== null) {
    const header = stripTags(dm[1]);
    const value = stripTags(dm[2]);
    if (!header || !value) continue;
    const key = header.replace(/\s+/g, "");
    // 이미 구조 A에서 채워졌다면 덮어쓰지 않음 (구조 A가 더 우선)
    if (!(key in result)) {
      result[key] = value;
    }
  }

  return result;
}

function pickField(kv: Record<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    const norm = k.replace(/\s+/g, "");
    for (const [actual, value] of Object.entries(kv)) {
      if (actual.includes(norm)) return value;
    }
  }
  return null;
}

async function fetchDetailInfo(branduid: string): Promise<DetailInfo> {
  const empty: DetailInfo = {
    name_en: null,
    country: null,
    region: null,
    grape_variety: null,
    alcohol: null,
    producer: null,
    description: null,
    wine_type_hint: null,
    price: null,
  };

  try {
    const url = `${BASE_URL}/shop/shopdetail.html?branduid=${branduid}&xcode=001`;
    const html = await fetchPage(url);

    // 영문명
    const enMatch =
      html.match(/<h4[^>]*class="[^"]*wine_eng_title[^"]*"[^>]*>([\s\S]*?)<\/h4>/) ||
      html.match(/<[^>]+class="[^"]*wine_eng_title[^"]*"[^>]*>([\s\S]*?)<\//);
    let name_en: string | null = null;
    if (enMatch) {
      name_en = stripTags(enMatch[1]).replace(/^\(|\)$/g, "").trim() || null;
    }

    // wine type hint (winetype_red 등)
    const typeMatch = html.match(/winetype_(red|white|sparkling|rose|natural|dessert|fortified)/i);
    const wine_type_hint = typeMatch ? typeMatch[1].toLowerCase() : null;

    // figure/table key-value 추출
    const kv = extractKeyValueTables(html);

    // 국가 > 지역 통합 필드
    const countryRegion = pickField(kv, ["나라>지역", "국가>지역", "나라", "국가"]);
    let country: string | null = null;
    let region: string | null = null;
    if (countryRegion) {
      const parts = countryRegion.split(/>|＞|→/).map((s) => s.trim()).filter(Boolean);
      country = parts[0] || null;
      region = parts.slice(1).join(" > ") || null;
    }

    const grape_variety = pickField(kv, ["품종", "포도품종"]);
    const alcohol = pickField(kv, ["알콜", "알코올", "도수"]);
    const producer = pickField(kv, ["생산자", "와이너리", "제조사"]);
    const description = pickField(kv, ["테이스팅노트", "테이스팅", "설명", "특징"]);

    // 가격: 상세 페이지의 hidden input이 가장 신뢰성 있음
    // <input type="hidden" id="price" name="price" value="105,000" />
    let price: number | null = null;
    const priceInputMatch = html.match(
      /<input[^>]*(?:id|name)=["']price["'][^>]*value=["']([0-9,]+)["']/
    );
    if (priceInputMatch) {
      const digits = priceInputMatch[1].replace(/,/g, "");
      if (digits) price = parseInt(digits);
    }

    return {
      name_en,
      country,
      region,
      grape_variety,
      alcohol,
      producer,
      description,
      wine_type_hint,
      price,
    };
  } catch {
    return empty;
  }
}

// ─── 3단계: Supabase raw_wines 저장 ─────────────────────────────────────────

async function upsertRawWines(wines: WineItem[]) {
  let saved = 0;

  for (let i = 0; i < wines.length; i++) {
    const wine = wines[i];
    if (!wine.name_ko) continue;

    const payload = {
      source: "gangnam",
      source_id: wine.branduid,
      name_ko: wine.name_ko,
      name_en: wine.name_en,
      wine_type: wine.wine_type,
      country: wine.country,
      region: wine.region,
      grape_variety: wine.grape_variety,
      producer: wine.producer,
      description: wine.description,
      price: wine.price,
      image_url: wine.image_url,
      alcohol: wine.alcohol,
      raw_payload: { branduid: wine.branduid },
    };

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/raw_wines?on_conflict=source,source_id`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify([payload]),
      }
    );

    if (res.ok) {
      saved++;
    } else {
      const err = await res.text();
      console.error(`  ⚠ 저장 실패: ${wine.name_ko}`, err);
    }

    if ((i + 1) % 50 === 0) {
      process.stdout.write(`  💾 ${i + 1}/${wines.length} 처리 (${saved}개 저장)\n`);
    }
  }

  console.log(`  💾 총 ${saved}개 upsert 완료 (${wines.length}개 중)`);
}

// ─── 실행 ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🍷 강남와인(gangnam.wine) 와인 수집 시작\n");

  const allWines: WineItem[] = [];

  for (const [name, { mcode, wineType }] of Object.entries(WINE_CATEGORIES)) {
    console.log(`\n🔍 ${name} 와인 수집 중...`);
    const wines = await collectFromCategory(name, mcode, wineType);
    allWines.push(...wines);
    if (SAMPLE_LIMIT > 0 && allWines.length >= SAMPLE_LIMIT) {
      console.log(`\n⏹  SAMPLE_LIMIT(${SAMPLE_LIMIT}) 도달, 추가 카테고리 스킵`);
      break;
    }
    await sleep(500);
  }

  // branduid 기준 전체 중복 제거 (같은 와인이 여러 카테고리에 있을 수 있음)
  const byId = new Map<string, WineItem>();
  for (const w of allWines) {
    if (!byId.has(w.branduid)) byId.set(w.branduid, w);
  }
  let uniqueWines = Array.from(byId.values());

  if (SAMPLE_LIMIT > 0 && uniqueWines.length > SAMPLE_LIMIT) {
    uniqueWines = uniqueWines.slice(0, SAMPLE_LIMIT);
    console.log(`⏹  SAMPLE_LIMIT(${SAMPLE_LIMIT})로 축소`);
  }

  console.log(`\n✅ 총 ${uniqueWines.length}개 와인 목록 수집 완료 (중복 제거 후)\n`);

  console.log("🔤 상세정보 수집 중...\n");
  for (let i = 0; i < uniqueWines.length; i++) {
    const wine = uniqueWines[i];
    const detail = await fetchDetailInfo(wine.branduid);
    wine.name_en = detail.name_en;
    wine.country = detail.country;
    wine.region = detail.region;
    wine.grape_variety = detail.grape_variety;
    wine.alcohol = detail.alcohol;
    wine.producer = detail.producer;
    if (detail.description) wine.description = detail.description;
    // 상세 페이지 가격이 있으면 우선 사용 (목록의 Sold Out 케이스를 덮어씀)
    if (detail.price !== null) wine.price = detail.price;
    // wine_type_hint가 카테고리 추정과 다르면 hint 우선 (단 'other'인 경우만)
    if (detail.wine_type_hint && wine.wine_type === "other") {
      wine.wine_type = detail.wine_type_hint;
    }
    await sleep(DETAIL_SLEEP_MS);

    if ((i + 1) % 20 === 0) {
      console.log(
        `  [${i + 1}/${uniqueWines.length}] 상세정보 수집 중... (최근: ${wine.name_en ?? wine.name_ko})`
      );
    }
  }

  console.log(`\n✅ 상세정보 수집 완료\n`);

  console.log("💾 raw_wines에 저장 중...\n");
  await upsertRawWines(uniqueWines);

  console.log(`\n🎉 완료! ${uniqueWines.length}개 와인이 처리되었습니다.`);
}

main().catch(console.error);
