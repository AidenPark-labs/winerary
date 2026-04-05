/**
 * 네이버 쇼핑 API를 활용한 한국 유통 와인 수집 스크립트
 *
 * 실행: npx tsx scripts/collect-wines.ts
 *
 * 1단계: 네이버 쇼핑에서 수입와인 카테고리 상품 수집
 * 2단계: Claude로 와인 상세정보(타입, 국가, 품종 등) 파싱
 * 3단계: Supabase wines 테이블에 저장
 */

import { config } from "dotenv";
import Anthropic from "@anthropic-ai/sdk";

config({ path: ".env.local" });

// ─── 환경변수 ────────────────────────────────────────────────────────────────

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID!;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ .env.local 환경변수를 확인하세요");
  process.exit(1);
}

// ─── 타입 ────────────────────────────────────────────────────────────────────

interface NaverItem {
  title: string;
  link: string;
  image: string;
  lprice: string;
  hprice: string;
  mallName: string;
  productId: string;
  category1: string;
  category2: string;
  category3: string;
  category4: string;
}

interface WineInfo {
  name_ko: string;
  name_en: string | null;
  wine_type: string | null;
  country: string | null;
  region: string | null;
  grape_variety: string | null;
  producer: string | null;
}

// ─── 1단계: 네이버 쇼핑 수집 ──────────────────────────────────────────────

const WINE_KEYWORDS = [
  "레드와인", "화이트와인", "로제와인", "스파클링와인",
  "까베르네 소비뇽", "피노 누아", "메를로", "쉬라즈", "말벡",
  "샤르도네", "소비뇽 블랑", "리슬링", "피노 그리지오",
  "산지오베제", "템프라니요", "그르나슈", "네비올로",
  "프로세코", "샴페인", "까바",
  "칠레 와인", "프랑스 와인", "이탈리아 와인", "스페인 와인",
  "호주 와인", "미국 와인", "아르헨티나 와인", "포르투갈 와인",
  "독일 와인", "뉴질랜드 와인",
  "와인 선물세트", "내추럴와인",
];

async function searchNaver(query: string, start: number = 1): Promise<NaverItem[]> {
  const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(query)}&display=100&start=${start}&sort=sim`;
  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": NAVER_CLIENT_ID,
      "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
    },
  });
  if (!res.ok) {
    console.error(`  ⚠ API 오류 (${res.status}): ${query}`);
    return [];
  }
  const data = await res.json();
  return (data.items ?? []).filter((item: NaverItem) => {
    const cats = [item.category1, item.category2, item.category3, item.category4];
    return cats.some((c) => c === "수입와인" || c === "와인");
  });
}

async function collectAllWines(): Promise<Map<string, { title: string; link: string; image: string; price: number | null }>> {
  const wines = new Map<string, { title: string; link: string; image: string; price: number | null }>();

  for (const keyword of WINE_KEYWORDS) {
    console.log(`🔍 검색 중: ${keyword}`);

    // 각 키워드당 최대 300개 (API 제한: start는 1~1000)
    for (let start = 1; start <= 201; start += 100) {
      const items = await searchNaver(keyword, start);
      if (items.length === 0) break;

      for (const item of items) {
        const title = item.title.replace(/<\/?b>/g, "").trim();
        // 중복 제거 (상품명 기준)
        if (!wines.has(title)) {
          wines.set(title, {
            title,
            link: item.link,
            image: item.image,
            price: item.lprice ? parseInt(item.lprice) : null,
          });
        }
      }

      // API 호출 간격 (초당 10회 제한)
      await sleep(150);
    }
  }

  console.log(`\n✅ 총 ${wines.size}개 고유 와인 수집 완료\n`);
  return wines;
}

// ─── 2단계: Claude로 상세정보 파싱 ──────────────────────────────────────────

const anthropic = new Anthropic();

async function parseWineInfo(wineNames: string[]): Promise<WineInfo[]> {
  const prompt = `다음 와인 상품명 목록에서 와인 정보를 추출해주세요. 각 상품명에서:
- name_ko: 정리된 한국어 와인 이름 (용량, 수량, 프로모션 문구 제거)
- name_en: 영어 원본 이름 (추정 가능한 경우)
- wine_type: red, white, rose, sparkling, fortified, dessert, other 중 하나
- country: 생산 국가 (한국어)
- region: 생산 지역 (알 수 있는 경우)
- grape_variety: 주요 품종 (알 수 있는 경우)
- producer: 생산자/와이너리 (알 수 있는 경우)

와인이 아닌 상품(와인잔, 오프너, 디캔터, 와인셀러 등 주변기기)은 결과에서 제외하세요.

반드시 JSON 배열만 응답하세요. 다른 텍스트 없이 순수 JSON만 출력하세요.

상품명 목록:
${wineNames.map((n, i) => `${i + 1}. ${n}`).join("\n")}`;

  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text = res.content[0].type === "text" ? res.content[0].text : "";
  try {
    // JSON 배열 추출
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    return JSON.parse(match[0]);
  } catch {
    console.error("  ⚠ JSON 파싱 실패");
    return [];
  }
}

// ─── 3단계: Supabase 저장 ───────────────────────────────────────────────────

async function upsertWines(wines: Array<{
  name_ko: string;
  name_en: string | null;
  wine_type: string | null;
  country: string | null;
  region: string | null;
  grape_variety: string | null;
  producer: string | null;
  price: number | null;
  naver_link: string | null;
  naver_image: string | null;
}>) {
  // 중복 name_ko 제거 (마지막 것 우선)
  const unique = new Map<string, typeof wines[0]>();
  for (const w of wines) {
    if (w.name_ko) unique.set(w.name_ko, w);
  }
  const deduped = Array.from(unique.values());
  let saved = 0;

  // 개별 upsert로 중복 에러 방지
  for (let i = 0; i < deduped.length; i++) {
    const wine = deduped[i];
    const res = await fetch(`${SUPABASE_URL}/rest/v1/wines`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
      },
      body: JSON.stringify([wine]),
    });

    if (res.ok) {
      saved++;
    } else {
      // 중복은 무시, 다른 에러만 로그
      const err = await res.text();
      if (!err.includes("23505")) {
        console.error(`  ⚠ 저장 실패: ${wine.name_ko}`, err);
      }
    }

    if ((i + 1) % 100 === 0) {
      process.stdout.write(`  💾 ${i + 1}/${deduped.length} 처리 (${saved}개 저장)\n`);
    }
  }
  console.log(`  💾 총 ${saved}개 신규 저장 (${deduped.length}개 중)`);
}

// ─── 유틸 ────────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── 실행 ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🍷 와인 DB 수집 시작\n");

  // 1단계: 네이버 쇼핑 수집
  const rawWines = await collectAllWines();
  const wineList = Array.from(rawWines.values());

  // 2단계: Claude로 상세정보 파싱 (20개씩 배치)
  const BATCH_SIZE = 20;
  const allParsed: Array<WineInfo & { price: number | null; naver_link: string | null; naver_image: string | null }> = [];

  console.log("🤖 AI로 와인 정보 파싱 중...\n");

  for (let i = 0; i < wineList.length; i += BATCH_SIZE) {
    const batch = wineList.slice(i, i + BATCH_SIZE);
    const names = batch.map((w) => w.title);

    process.stdout.write(`  [${i + 1}~${Math.min(i + BATCH_SIZE, wineList.length)} / ${wineList.length}] 파싱 중...`);

    const parsed = await parseWineInfo(names);

    // 원본 데이터와 매칭
    for (const info of parsed) {
      const original = batch.find((w) =>
        w.title.includes(info.name_ko) || info.name_ko.includes(w.title.substring(0, 10))
      ) ?? batch.find((w) => {
        const cleanTitle = w.title.replace(/[^가-힣a-zA-Z]/g, "").toLowerCase();
        const cleanName = info.name_ko.replace(/[^가-힣a-zA-Z]/g, "").toLowerCase();
        return cleanTitle.includes(cleanName) || cleanName.includes(cleanTitle.substring(0, 8));
      });

      allParsed.push({
        ...info,
        price: original?.price ?? null,
        naver_link: original?.link ?? null,
        naver_image: original?.image ?? null,
      });
    }

    console.log(` ✅ ${parsed.length}개 파싱 완료`);

    // API 호출 간격
    await sleep(500);
  }

  console.log(`\n✅ 총 ${allParsed.length}개 와인 정보 파싱 완료\n`);

  // 3단계: Supabase 저장
  console.log("💾 Supabase에 저장 중...\n");
  await upsertWines(allParsed);

  console.log(`\n🎉 완료! ${allParsed.length}개 와인이 DB에 저장되었습니다.`);
}

main().catch(console.error);
