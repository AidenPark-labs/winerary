/**
 * 와인나라(winenara.com) 와인 수집 스크립트
 *
 * 실행: npx tsx scripts/collect-winenara.ts
 *
 * 1단계: 와인나라 목록 페이지에서 와인 기본정보 수집
 * 2단계: 상세 페이지에서 영문명 수집
 * 3단계: Supabase wines 테이블에 저장
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

const BASE_URL = "https://www.winenara.com";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// 와인 카테고리별 코드 (sh_category2_cd=10100: 종류별)
const WINE_CATEGORIES: Record<string, { code: string; wineType: string }> = {
  레드: { code: "10101", wineType: "red" },
  화이트: { code: "10102", wineType: "white" },
  로제: { code: "10103", wineType: "rose" },
  스파클링: { code: "10104", wineType: "sparkling" },
  디저트: { code: "10105", wineType: "dessert" },
  주정강화: { code: "10108", wineType: "fortified" },
};

// ─── 타입 ────────────────────────────────────────────────────────────────────

interface WineItem {
  product_cd: string;
  name_ko: string;
  name_en: string | null;
  wine_type: string;
  country: string | null;
  grape_variety: string | null;
  description: string | null;
  price: number | null;
  image_url: string | null;
}

// ─── 유틸 ────────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

// ─── 1단계: 목록 페이지에서 와인 수집 ─────────────────────────────────────────

function parseListPage(html: string, wineType: string): WineItem[] {
  const wines: WineItem[] = [];

  // 각 상품 아이템 블록 추출 (<li> 내부의 <div class="item">)
  const itemRegex = /<li>\s*<div class="item">([\s\S]*?)<\/div>\s*<\/div>\s*<\/li>/g;
  let match;

  while ((match = itemRegex.exec(html)) !== null) {
    const block = match[1];

    // product_cd
    const cdMatch = block.match(/product_cd=([A-Za-z0-9]+)/);
    if (!cdMatch) continue;
    const product_cd = cdMatch[1];

    // 한글 이름
    const nameMatch = block.match(/<p class="prd_name">.*?<span>(.*?)<\/span>/s);
    const name_ko = nameMatch ? nameMatch[1].trim() : "";
    if (!name_ko) continue;

    // 설명
    const infoMatch = block.match(/<p class="prd_info">(.*?)<\/p>/s);
    const description = infoMatch ? infoMatch[1].trim() : null;

    // 카테고리 라벨 (타입, 국가, 품종)
    const labels: string[] = [];
    const labelRegex = /style="background:#E0D8EA[^"]*">(.*?)<\/span>/g;
    let labelMatch;
    while ((labelMatch = labelRegex.exec(block)) !== null) {
      labels.push(labelMatch[1].trim());
    }

    // labels[0]=타입, labels[1]=국가, labels[2]=품종 (보통 이 순서)
    const country = labels[1] || null;
    const grape_variety = labels[2] || null;

    // 가격 (할인가 우선)
    const priceMatch = block.match(/<ins>([\d,]+)원<\/ins>/);
    const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, "")) : null;

    // 이미지
    const imgMatch = block.match(/srcset="(\/uploads\/product\/[^"]+)"/);
    const image_url = imgMatch ? `${BASE_URL}${imgMatch[1]}` : null;

    wines.push({
      product_cd,
      name_ko,
      name_en: null,
      wine_type: wineType,
      country,
      grape_variety,
      description,
      price,
      image_url,
    });
  }

  return wines;
}

function getTotalPages(html: string): number {
  // 페이지네이션에서 최대 페이지 번호 찾기
  const pageMatches = html.match(/page=(\d+)/g);
  if (!pageMatches) return 1;
  const pages = pageMatches.map((p) => parseInt(p.replace("page=", "")));
  return Math.max(...pages, 1);
}

async function collectFromCategory(
  categoryName: string,
  categoryCode: string,
  wineType: string
): Promise<WineItem[]> {
  const allWines: WineItem[] = [];
  const seenCodes = new Set<string>();

  // 첫 페이지에서 총 페이지 수 파악
  const firstUrl = `${BASE_URL}/shop/product/product_lists?sh_category1_cd=10000&sh_category2_cd=10100&sh_category3_cd=${categoryCode}&page=1`;
  const firstHtml = await fetchPage(firstUrl);
  const totalPages = getTotalPages(firstHtml);

  console.log(`  📄 ${categoryName}: 총 ${totalPages} 페이지`);

  // 첫 페이지 파싱
  const firstWines = parseListPage(firstHtml, wineType);
  for (const w of firstWines) {
    if (!seenCodes.has(w.product_cd)) {
      seenCodes.add(w.product_cd);
      allWines.push(w);
    }
  }

  // 나머지 페이지
  for (let page = 2; page <= totalPages; page++) {
    await sleep(300);
    const url = `${BASE_URL}/shop/product/product_lists?sh_category1_cd=10000&sh_category2_cd=10100&sh_category3_cd=${categoryCode}&page=${page}`;
    try {
      const html = await fetchPage(url);
      const wines = parseListPage(html, wineType);
      for (const w of wines) {
        if (!seenCodes.has(w.product_cd)) {
          seenCodes.add(w.product_cd);
          allWines.push(w);
        }
      }
      process.stdout.write(`  [${page}/${totalPages}] ${allWines.length}개 수집\r`);
    } catch (err) {
      console.error(`  ⚠ 페이지 ${page} 실패:`, err);
    }
  }

  console.log(`  ✅ ${categoryName}: ${allWines.length}개 수집 완료`);
  return allWines;
}

// ─── 2단계: 상세 페이지에서 영문명·설명 수집 ─────────────────────────────────

interface DetailInfo {
  name_en: string | null;
  description: string | null;
}

async function fetchDetailInfo(product_cd: string): Promise<DetailInfo> {
  try {
    const url = `${BASE_URL}/shop/product/product_view?product_cd=${product_cd}`;
    const html = await fetchPage(url);

    const enMatch = html.match(/<p class="prd_en_name">(.*?)<\/p>/s);
    const descMatch = html.match(/<p class="prd_info">(.*?)<\/p>/s);

    return {
      name_en: enMatch ? enMatch[1].trim() : null,
      description: descMatch ? descMatch[1].trim() : null,
    };
  } catch {
    return { name_en: null, description: null };
  }
}

// ─── 3단계: Supabase 저장 ───────────────────────────────────────────────────

async function upsertWines(wines: WineItem[]) {
  // name_ko 기준 중복 제거
  const unique = new Map<string, WineItem>();
  for (const w of wines) {
    if (w.name_ko) unique.set(w.name_ko, w);
  }
  const deduped = Array.from(unique.values());
  let saved = 0;
  let skipped = 0;

  for (let i = 0; i < deduped.length; i++) {
    const wine = deduped[i];
    const payload = {
      name_ko: wine.name_ko,
      name_en: wine.name_en,
      wine_type: wine.wine_type,
      country: wine.country,
      grape_variety: wine.grape_variety,
      description: wine.description,
      price: wine.price,
      naver_image: wine.image_url, // 이미지 컬럼 재활용
      data_source: "winenara",
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/wines`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify([payload]),
    });

    if (res.ok) {
      saved++;
    } else {
      const err = await res.text();
      if (err.includes("23505")) {
        skipped++;
      } else {
        console.error(`  ⚠ 저장 실패: ${wine.name_ko}`, err);
      }
    }

    if ((i + 1) % 50 === 0) {
      process.stdout.write(`  💾 ${i + 1}/${deduped.length} 처리 (${saved}개 저장, ${skipped}개 중복)\n`);
    }
  }

  console.log(`  💾 총 ${saved}개 신규 저장, ${skipped}개 중복 스킵 (${deduped.length}개 중)`);
}

// ─── 실행 ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🍷 와인나라 와인 수집 시작\n");

  // 1단계: 카테고리별 목록 수집
  const allWines: WineItem[] = [];

  for (const [name, { code, wineType }] of Object.entries(WINE_CATEGORIES)) {
    console.log(`\n🔍 ${name} 와인 수집 중...`);
    const wines = await collectFromCategory(name, code, wineType);
    allWines.push(...wines);
    await sleep(500);
  }

  console.log(`\n✅ 총 ${allWines.length}개 와인 목록 수집 완료\n`);

  // 2단계: 상세 페이지에서 영문명·설명 수집
  console.log("🔤 상세정보 수집 중...\n");
  for (let i = 0; i < allWines.length; i++) {
    const wine = allWines[i];
    const detail = await fetchDetailInfo(wine.product_cd);
    wine.name_en = detail.name_en;
    if (detail.description) wine.description = detail.description;
    await sleep(200);

    if ((i + 1) % 20 === 0) {
      console.log(`  [${i + 1}/${allWines.length}] 상세정보 수집 중... (최근: ${wine.name_en ?? wine.name_ko})`);
    }
  }

  console.log(`\n✅ 상세정보 수집 완료\n`);

  // 3단계: Supabase 저장
  console.log("💾 Supabase에 저장 중...\n");
  await upsertWines(allWines);

  console.log(`\n🎉 완료! ${allWines.length}개 와인이 처리되었습니다.`);
}

main().catch(console.error);
