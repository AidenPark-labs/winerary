/**
 * region_ko / wine_style_ko 재백필
 *
 * - region_ko NULL + region_path 영어 세그먼트 포함 → term_dict 역방향 매칭
 * - wine_style_ko NULL + wine_style 존재 → 토큰 분해 후 country/region/grape/color 매핑 조합
 *
 * 실행:
 *   NODE_ENV=development npx tsx scripts/backfill-region-style-ko.ts --dry-run
 *   NODE_ENV=development npx tsx scripts/backfill-region-style-ko.ts
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const DRY_RUN = process.argv.includes("--dry-run");

interface Entry { category: string; en: string; ko: string; aliases: string[] }

function normKey(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*/g, " ").trim().toLowerCase().replace(/\s+/g, " ");
}

async function loadDict(): Promise<Map<string, Entry>> {
  const m = new Map<string, Entry>();
  let off = 0;
  while (true) {
    const { data, error } = await sb
      .from("term_dict")
      .select("category, en, ko, aliases")
      .order("category")
      .order("en")
      .range(off, off + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data as Array<{ category: string; en: string; ko: string; aliases: string[] | null }>) {
      const e: Entry = { category: r.category, en: r.en, ko: r.ko, aliases: r.aliases ?? [] };
      m.set(`${e.category}::${normKey(e.en)}`, e);
      m.set(`${e.category}::${normKey(e.ko)}`, e);
      for (const a of e.aliases) if (a) m.set(`${e.category}::${normKey(a)}`, e);
    }
    if (data.length < 1000) break;
    off += data.length;
  }
  return m;
}

function lookup(dict: Map<string, Entry>, cat: string, val: string | null | undefined): Entry | null {
  if (!val) return null;
  const k = normKey(val);
  return k ? dict.get(`${cat}::${k}`) ?? null : null;
}

// region_path = "A / B / C / D" 형태. 뒤에서부터 region 카테고리 매칭
function resolveRegionKo(dict: Map<string, Entry>, regionPath: string): string | null {
  const segs = regionPath.split("/").map((s) => s.trim()).filter(Boolean);
  for (let i = segs.length - 1; i >= 1; i--) {
    const e = lookup(dict, "region", segs[i]);
    if (e) return e.ko;
  }
  // 마지막 시도: 첫 세그먼트 (country) region 매핑 (예: "호주")
  if (segs.length > 0) {
    const e = lookup(dict, "region", segs[0]) ?? lookup(dict, "country", segs[0]);
    if (e) return e.ko;
  }
  return null;
}

// wine_style 예시: "Languedoc-Roussillon Red", "New Zealand Sauvignon Blanc", "French Champagne"
// 토큰을 country/region/grape/color 매핑하여 한글 조합
const COLOR_MAP: Record<string, string> = {
  red: "레드",
  white: "화이트",
  rosé: "로제",
  rose: "로제",
  sparkling: "스파클링",
  dessert: "디저트",
  fortified: "주정강화",
};

// 국가 형용사형 → 한글 매핑 (term_dict은 명사형만 보유)
const COUNTRY_ADJ_MAP: Record<string, string> = {
  french: "프랑스",
  italian: "이탈리아",
  spanish: "스페인",
  german: "독일",
  australian: "호주",
  american: "미국",
  californian: "캘리포니아",
  chilean: "칠레",
  argentinian: "아르헨티나",
  argentine: "아르헨티나",
  portuguese: "포르투갈",
  austrian: "오스트리아",
  hungarian: "헝가리",
  greek: "그리스",
  georgian: "조지아",
  romanian: "루마니아",
  croatian: "크로아티아",
  lebanese: "레바논",
  moldovan: "몰도바",
  israeli: "이스라엘",
  japanese: "일본",
  brazilian: "브라질",
  uruguayan: "우루과이",
  "south african": "남아공",
  "new zealand": "뉴질랜드",
  "northern italy": "북부 이탈리아",
  "southern italy": "남부 이탈리아",
  "central italy": "중부 이탈리아",
};

// 추가 스타일/아펠라시옹 용어 (term_dict에 없을 수 있음)
const STYLE_EXTRA_MAP: Record<string, string> = {
  champagne: "샴페인",
  cava: "카바",
  prosecco: "프로세코",
  amarone: "아마로네",
  barolo: "바롤로",
  brunello: "브루넬로",
  chianti: "키안티",
  "ruby port": "루비 포트",
  "tawny port": "토니 포트",
  "late bottled vintage port": "LBV 포트",
  port: "포트",
  sherry: "셰리",
  crémant: "크레망",
  cremant: "크레망",
  carménère: "카르메네르",
  carmenere: "카르메네르",
  torrontés: "토론테스",
  torrontes: "토론테스",
  "pinot gris": "피노 그리/피노 그리지오",
  "pinot grigio": "피노 그리/피노 그리지오",
  gewürztraminer: "게뷔르츠트라미너",
  gewurztraminer: "게뷔르츠트라미너",
  pinotage: "피노타지",
  "pinotage blend": "피노타지 블렌드",
  "chenin blanc": "슈냉 블랑",
  cannonau: "칸노나우",
  mencia: "멘시아",
  mencía: "멘시아",
  garnacha: "그르나슈/가르나차",
  grenache: "그르나슈/가르나차",
};

function resolveStyleKo(dict: Map<string, Entry>, style: string): string | null {
  const norm = style.trim();
  if (!norm) return null;

  // 색상 추출
  let color: string | null = null;
  let baseText = norm;
  const lower = norm.toLowerCase();
  for (const [en, ko] of Object.entries(COLOR_MAP)) {
    const re = new RegExp(`\\b${en}\\b`, "i");
    if (re.test(lower)) {
      color = ko;
      baseText = baseText.replace(re, "").replace(/\s+/g, " ").trim();
      break;
    }
  }

  // 국가 형용사 추출 (맨 앞에만 있는 경우가 대부분: "French Champagne", "Chilean ...")
  let countryKo: string | null = null;
  for (const [adj, ko] of Object.entries(COUNTRY_ADJ_MAP)) {
    const re = new RegExp(`\\b${adj}\\b`, "i");
    if (re.test(baseText)) {
      countryKo = ko;
      baseText = baseText.replace(re, "").replace(/\s+/g, " ").trim();
      break;
    }
  }

  // STYLE_EXTRA_MAP 매칭 (Champagne, Cava, Amarone 등 — grape 겸 style)
  let styleExtraKo: string | null = null;
  for (const [en, ko] of Object.entries(STYLE_EXTRA_MAP).sort((a, b) => b[0].length - a[0].length)) {
    const re = new RegExp(`\\b${en.replace(/[éè]/g, "[éèe]")}\\b`, "i");
    if (re.test(baseText)) {
      styleExtraKo = ko;
      baseText = baseText.replace(re, "").replace(/\s+/g, " ").trim();
      break;
    }
  }

  // 그레이프 (styleExtra가 있으면 이미 처리됨)
  let grapeKo: string | null = null;
  if (!styleExtraKo) {
    const gr = baseText.match(/(Pinot Noir|Sauvignon Blanc|Cabernet Sauvignon|Pinot Grigio|Pinot Gris|Chardonnay|Shiraz\/Syrah|Shiraz|Syrah|Merlot|Riesling|Zinfandel|Malbec|Tempranillo|Nebbiolo|Sangiovese|Grenache|Viognier|Barbera)/i);
    if (gr) {
      const grEn = gr[0];
      const e = lookup(dict, "grape", grEn) ?? lookup(dict, "style", grEn);
      if (e) grapeKo = e.ko;
      baseText = baseText.replace(new RegExp(`\\b${grEn.replace("/", "\\/")}\\b`, "i"), "").replace(/\s+/g, " ").trim();
    }
  }

  // 나머지를 region으로 파싱
  const parts: string[] = [];
  if (countryKo) parts.push(countryKo);

  const regionToken = baseText.trim();
  if (regionToken) {
    const whole = lookup(dict, "region", regionToken) ?? lookup(dict, "country", regionToken);
    if (whole) {
      if (!parts.includes(whole.ko)) parts.push(whole.ko);
    } else {
      // 공백 구분 하위 스팬 시도 (최대 길이부터, 다중 매칭 허용)
      const words = regionToken.split(/\s+/);
      const consumed = new Set<number>();
      for (let i = words.length; i >= 1; i--) {
        for (let j = 0; j + i <= words.length; j++) {
          if ([...Array(i)].some((_, k) => consumed.has(j + k))) continue;
          const cand = words.slice(j, j + i).join(" ");
          const hit = lookup(dict, "region", cand) ?? lookup(dict, "country", cand);
          if (hit && !parts.includes(hit.ko)) {
            parts.push(hit.ko);
            for (let k = 0; k < i; k++) consumed.add(j + k);
          }
        }
      }
    }
  }

  if (styleExtraKo && !parts.includes(styleExtraKo)) parts.push(styleExtraKo);
  if (grapeKo && !parts.includes(grapeKo)) parts.push(grapeKo);
  if (color && !parts.includes(color)) parts.push(color);

  if (parts.length === 0) return null;
  return parts.join(" ");
}

async function main() {
  console.log(`${DRY_RUN ? "[DRY-RUN]" : "[EXEC]"} region_ko / wine_style_ko 재백필\n`);
  const dict = await loadDict();
  console.log(`term_dict 로드: ${dict.size} 엔트리\n`);

  // 1. region_ko 재백필
  console.log("=== region_ko ===");
  const regionTargets: Array<{ id: string; region_path: string }> = [];
  let off = 0;
  while (true) {
    const { data, error } = await sb
      .from("wines")
      .select("id, region_path")
      .is("region_ko", null)
      .not("region_path", "is", null)
      .neq("region_path", "")
      .order("id")
      .range(off, off + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    regionTargets.push(...(data as typeof regionTargets));
    if (data.length < 1000) break;
    off += data.length;
  }
  console.log(`대상: ${regionTargets.length}건`);

  let regionFilled = 0, regionSkipped = 0, regionErrors = 0;
  for (const w of regionTargets) {
    const ko = resolveRegionKo(dict, w.region_path);
    if (!ko) { regionSkipped++; continue; }
    if (DRY_RUN) { regionFilled++; continue; }
    const { error } = await sb.from("wines").update({ region_ko: ko }).eq("id", w.id);
    if (error) { regionErrors++; } else regionFilled++;
    if ((regionFilled + regionErrors) % 100 === 0) process.stdout.write(`\r  ${regionFilled + regionErrors}/${regionTargets.length}`);
  }
  process.stdout.write("\n");
  console.log(`  채움: ${regionFilled}  term_dict 매칭 실패(skip): ${regionSkipped}  에러: ${regionErrors}`);

  // 2. wine_style_ko 재백필
  console.log("\n=== wine_style_ko ===");
  const styleTargets: Array<{ id: string; wine_style: string }> = [];
  off = 0;
  while (true) {
    const { data, error } = await sb
      .from("wines")
      .select("id, wine_style")
      .is("wine_style_ko", null)
      .not("wine_style", "is", null)
      .neq("wine_style", "")
      .order("id")
      .range(off, off + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    styleTargets.push(...(data as typeof styleTargets));
    if (data.length < 1000) break;
    off += data.length;
  }
  console.log(`대상: ${styleTargets.length}건`);

  let styleFilled = 0, styleSkipped = 0, styleErrors = 0;
  const sampleFilled: string[] = [];
  const sampleSkipped: string[] = [];
  for (const w of styleTargets) {
    const ko = resolveStyleKo(dict, w.wine_style);
    if (!ko) {
      styleSkipped++;
      if (sampleSkipped.length < 20) sampleSkipped.push(w.wine_style);
      continue;
    }
    if (sampleFilled.length < 20) sampleFilled.push(`${w.wine_style} → ${ko}`);
    if (DRY_RUN) { styleFilled++; continue; }
    const { error } = await sb.from("wines").update({ wine_style_ko: ko }).eq("id", w.id);
    if (error) { styleErrors++; } else styleFilled++;
    if ((styleFilled + styleErrors) % 500 === 0) process.stdout.write(`\r  ${styleFilled + styleErrors}/${styleTargets.length}`);
  }
  process.stdout.write("\n");
  console.log(`  채움: ${styleFilled}  매칭 실패(skip): ${styleSkipped}  에러: ${styleErrors}`);

  console.log(`\n[style 채움 샘플]`);
  for (const s of sampleFilled) console.log(`  ${s}`);
  console.log(`\n[style 스킵 샘플]`);
  for (const s of sampleSkipped) console.log(`  ${s}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
