/**
 * v5 백필용 — term_dict 미커버 unique 항목을 LLM(claude-haiku-4-5)으로 번역.
 *
 * 흐름:
 *   1. wines에서 미커버 unique 항목 추출 (grape/region/country/producer)
 *   2. claude-haiku로 번역 (배치 호출)
 *   3. 결과 JSON으로 저장 (사용자 검토용)
 *   4. --import 모드로 term_dict INSERT
 *
 * 정책: 한글 표기는 출신 국가 원어 발음 우선, 한국 와인 업계 관용 우선.
 * (memory/feedback_ko_pronunciation_native_origin.md)
 *
 * 실행:
 *   NODE_ENV=development npx tsx scripts/v5-translate-unknowns.ts --extract
 *   NODE_ENV=development npx tsx scripts/v5-translate-unknowns.ts --translate
 *   NODE_ENV=development npx tsx scripts/v5-translate-unknowns.ts --import
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { loadTermDict } from "../src/lib/wines-v2-transform";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY 필요");
  process.exit(1);
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const args = process.argv.slice(2);
const MODE = args.includes("--extract")
  ? "extract"
  : args.includes("--translate")
    ? "translate"
    : args.includes("--import")
      ? "import"
      : null;

if (!MODE) {
  console.error("--extract | --translate | --import 중 하나 필요");
  process.exit(1);
}

const OUTPUT_DIR = "backup";
const EXTRACT_FILE = path.join(OUTPUT_DIR, "v5-unknowns-extracted.json");
const TRANSLATE_FILE = path.join(OUTPUT_DIR, "v5-unknowns-translated.json");

const HANGUL = /[가-힯ᄀ-ᇿ㄰-㆏]/;
const LATIN = /[A-Za-z]/;
const isHangul = (s: string) => HANGUL.test(s);
const isLatin = (s: string) => LATIN.test(s) && !HANGUL.test(s);

interface UnknownItem {
  category: "grape" | "region" | "country" | "winery";
  input: string;
  /** 변환 방향: 영→한 또는 한→영 */
  direction: "en_to_ko" | "ko_to_en";
}

interface TranslatedItem extends UnknownItem {
  en: string;
  ko: string;
  aliases: string[];
}

// ============================================================================
// 1) 추출 — wines에서 unique 미커버 항목
// ============================================================================

async function fetchAllWines(): Promise<any[]> {
  const out: any[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb
      .from("wines")
      .select(
        "country, country_ko, region, region_ko, region_path, producer, producer_ko, producer_en, winery_en_clean, vivino_winery, grape_variety, grape_varieties, grape_varieties_ko, vivino_grapes",
      )
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function doExtract() {
  const dict = await loadTermDict(sb);
  const rows = await fetchAllWines();
  console.log(`총 wines: ${rows.length}`);

  const unknowns: UnknownItem[] = [];
  const seen = new Set<string>();
  const add = (item: UnknownItem) => {
    const key = `${item.category}::${item.input.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    unknowns.push(item);
  };

  for (const r of rows) {
    // grape (영문 미커버 → 한글)
    const grapes: string[] = [];
    if (Array.isArray(r.grape_varieties)) grapes.push(...r.grape_varieties);
    if (Array.isArray(r.grape_varieties_ko)) grapes.push(...r.grape_varieties_ko);
    if (typeof r.grape_variety === "string") grapes.push(...r.grape_variety.split(/[,;/]/));
    if (typeof r.vivino_grapes === "string") grapes.push(...r.vivino_grapes.split(/[,;/]/));
    for (const raw of grapes) {
      const s = String(raw).trim();
      if (!s || isHangul(s) || !isLatin(s)) continue;
      const cleaned = s.replace(/\s*\d+(?:\.\d+)?\s*%/g, "").replace(/\s*\([^)]*\)\s*/g, " ").trim();
      if (!cleaned || isHangul(cleaned) || !isLatin(cleaned)) continue;
      if (!dict.match("grape", cleaned)) {
        add({ category: "grape", input: cleaned, direction: "en_to_ko" });
      }
    }

    // region (영문 미커버 → 한글, finest)
    for (const v of [r.region, r.region_path, r.region_ko]) {
      if (!v) continue;
      const parts = String(v).split(/[/>]/).map((s) => s.trim()).filter(Boolean);
      if (parts.length === 0) continue;
      let matched = false;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i].replace(/\s*\([^)]*\)\s*/g, " ").trim();
        if (dict.match("region", p)) {
          matched = true;
          break;
        }
      }
      if (matched) continue;
      const finest = parts[parts.length - 1].replace(/\s*\([^)]*\)\s*/g, " ").trim();
      if (!finest || isHangul(finest) || !isLatin(finest)) continue;
      add({ category: "region", input: finest, direction: "en_to_ko" });
    }

    // country (영문 미커버 → 한글)
    for (const v of [r.country, r.country_ko]) {
      if (!v) continue;
      const s = String(v).trim();
      if (!s || isHangul(s) || !isLatin(s)) continue;
      if (!dict.match("country", s)) {
        add({ category: "country", input: s, direction: "en_to_ko" });
      }
    }

    // winery (한글 미커버 → 영문)
    const koProducer = [r.producer, r.producer_ko].find((v) => v && isHangul(String(v)));
    if (koProducer) {
      const s = String(koProducer).trim();
      const hasEn =
        (r.producer_en && isLatin(String(r.producer_en))) ||
        (r.winery_en_clean && isLatin(String(r.winery_en_clean))) ||
        (r.vivino_winery && isLatin(String(r.vivino_winery)));
      const parenEn = s.match(/\(([^)]+)\)/);
      const hasParenEn = parenEn && /[A-Za-z]/.test(parenEn[1]) && !/[가-힯]/.test(parenEn[1]);
      if (!hasEn && !hasParenEn && !dict.match("winery", s)) {
        add({ category: "winery", input: s, direction: "ko_to_en" });
      }
    }
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(EXTRACT_FILE, JSON.stringify(unknowns, null, 2), "utf8");

  const counts = unknowns.reduce<Record<string, number>>((acc, u) => {
    acc[u.category] = (acc[u.category] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`추출 완료 (${EXTRACT_FILE}):`);
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  console.log(`  합계: ${unknowns.length}`);
}

// ============================================================================
// 2) 번역 — claude-haiku
// ============================================================================

const SYSTEM_PROMPT = `당신은 와인 도메인 번역 전문가입니다.

[정책]
한글 표기는 와인 출신 국가의 원어 발음 우선, 한국 와인 업계 관용 표기가 명확히 다르면 관용 우선.
- Burgundy → 부르고뉴 (프랑스식 Bourgogne 기반)
- Tuscany → 토스카나 (이탈리아식 Toscana)
- Champagne (와인) → 샴페인 (한국 관용)
- Cognac → 코냑 (한국 관용)
- 품종은 프랑스식 발음 (까베르네 소비뇽, 샤르도네)

[작업]
입력은 와인 용어 목록입니다. 카테고리(grape, region, country, winery)와 방향(en_to_ko 또는 ko_to_en)이 있습니다.
각 입력에 대해:
- input: 원본 그대로
- en: canonical 영문 표기 (공식·업계 표준)
- ko: 한글 표기 (정책에 따른 한국 와인 업계 표기)
- aliases: 흔한 다른 표기 (영문·한글 모두, 0~3개)

[출력 형식]
JSON 배열만 반환. 다른 텍스트 없이.
[{"input":"...","en":"...","ko":"...","aliases":["..."]}]`;

const client = new Anthropic();
const MODEL = "claude-haiku-4-5-20251001";
const BATCH_SIZE = 25;

async function translateBatch(items: UnknownItem[]): Promise<TranslatedItem[]> {
  const userText = items
    .map((i) => `- category=${i.category}, direction=${i.direction}, input="${i.input}"`)
    .join("\n");

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: `다음을 번역하세요:\n\n${userText}` }],
  });

  const content = resp.content[0];
  if (content.type !== "text") throw new Error("text 응답 없음");
  const raw = content.text.trim();
  // JSON 배열 추출
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end < 0) throw new Error(`JSON 배열 없음: ${raw.slice(0, 100)}`);
  const parsed = JSON.parse(raw.slice(start, end + 1)) as Array<{
    input: string;
    en: string;
    ko: string;
    aliases?: string[];
  }>;

  // 입력과 매칭 (input 기준)
  const out: TranslatedItem[] = [];
  for (const item of items) {
    const t = parsed.find((p) => p.input === item.input);
    if (!t) {
      console.warn(`[skip] ${item.category}::${item.input} — LLM 응답에서 못 찾음`);
      continue;
    }
    out.push({
      ...item,
      en: t.en,
      ko: t.ko,
      aliases: Array.isArray(t.aliases) ? t.aliases : [],
    });
  }
  return out;
}

async function doTranslate() {
  if (!fs.existsSync(EXTRACT_FILE)) {
    console.error(`먼저 --extract 실행. ${EXTRACT_FILE} 없음.`);
    process.exit(1);
  }
  const items: UnknownItem[] = JSON.parse(fs.readFileSync(EXTRACT_FILE, "utf8"));
  console.log(`번역 대상 ${items.length}개 (배치 ${BATCH_SIZE})`);

  const results: TranslatedItem[] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    process.stdout.write(`  배치 ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length}개)...`);
    const translated = await translateBatch(batch);
    results.push(...translated);
    process.stdout.write(` ✓ 누적 ${results.length}\n`);
  }

  fs.writeFileSync(TRANSLATE_FILE, JSON.stringify(results, null, 2), "utf8");
  console.log(`\n번역 완료 (${TRANSLATE_FILE}): ${results.length}건`);
  console.log(`사용자 확인 후 --import 실행.`);
}

// ============================================================================
// 3) term_dict INSERT
// ============================================================================

/**
 * INSERT 정책 (2026-05-02 결정):
 *   - grape 카테고리만 자동 INSERT (정확도 높음)
 *   - region: 노이즈 많음 (wine of X, 도시명 등) → 미등록, wines_v2 backfill에서 needs_review로 위임
 *   - winery: 환각 위험 (한국 발음 그대로 영문화) → 미등록, 어드민 검수 위임
 *   - Barbaresco: LLM이 grape로 잘못 분류 (실제 region) → 제외
 */
const SKIP_GRAPE_INPUTS = new Set(["Barbaresco"]);

async function doImport() {
  if (!fs.existsSync(TRANSLATE_FILE)) {
    console.error(`먼저 --translate 실행. ${TRANSLATE_FILE} 없음.`);
    process.exit(1);
  }
  const all: TranslatedItem[] = JSON.parse(fs.readFileSync(TRANSLATE_FILE, "utf8"));

  // 카테고리별 분류
  const grapeItems = all.filter(
    (i) => i.category === "grape" && !SKIP_GRAPE_INPUTS.has(i.input),
  );
  const skippedByCategory = {
    region: all.filter((i) => i.category === "region").length,
    winery: all.filter((i) => i.category === "winery").length,
    country: all.filter((i) => i.category === "country").length,
    grape_blacklist: all.filter(
      (i) => i.category === "grape" && SKIP_GRAPE_INPUTS.has(i.input),
    ).length,
  };

  console.log(`전체 번역: ${all.length}건`);
  console.log(`grape INSERT 대상: ${grapeItems.length}건`);
  console.log(`스킵: region ${skippedByCategory.region} / winery ${skippedByCategory.winery} / country ${skippedByCategory.country} / grape blacklist ${skippedByCategory.grape_blacklist}`);
  console.log();

  let inserted = 0;
  let dupSkipped = 0;
  let errored = 0;
  for (const item of grapeItems) {
    const { data: existing } = await sb
      .from("term_dict")
      .select("id")
      .eq("category", item.category)
      .eq("en", item.en)
      .maybeSingle();

    if (existing) {
      dupSkipped++;
      continue;
    }

    const { error } = await sb.from("term_dict").insert({
      category: item.category,
      en: item.en,
      ko: item.ko,
      aliases: item.aliases ?? [],
    });
    if (error) {
      console.warn(`[error] ${item.category}::${item.en} — ${error.message}`);
      errored++;
    } else {
      inserted++;
    }
  }
  console.log(`grape INSERT 완료: 신규 ${inserted} / 중복 ${dupSkipped} / 에러 ${errored}`);
  console.log(`region·winery·country는 wines_v2 backfill 시 needs_review로 위임됨.`);
}

// ============================================================================

async function main() {
  if (MODE === "extract") await doExtract();
  else if (MODE === "translate") await doTranslate();
  else if (MODE === "import") await doImport();
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
