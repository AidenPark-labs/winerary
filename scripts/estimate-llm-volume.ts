// LLM 변환 필요 unique 항목 수 실측
// (중복 제거 후 실제 LLM 호출이 발생할 건수)
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { loadTermDict, normKey } from "../src/lib/wines-v2-transform";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const HANGUL = /[가-힯ᄀ-ᇿ㄰-㆏]/;
const LATIN = /[A-Za-z]/;
const isHangul = (s: string) => HANGUL.test(s);
const isLatin = (s: string) => LATIN.test(s) && !HANGUL.test(s);

async function fetchAll() {
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

async function main() {
  console.log("term_dict 로드 중...");
  const dict = await loadTermDict(sb);
  console.log("wines 로드 중...");
  const rows = await fetchAll();
  console.log(`총 wines: ${rows.length}`);

  // unique 영문 미커버 항목 수집
  const grapeUnknowns = new Set<string>();
  const regionUnknowns = new Set<string>();
  const countryUnknowns = new Set<string>();
  const producerUnknowns = new Set<string>(); // 한글 미커버 (영문 변환 필요)

  for (const r of rows) {
    // grape: grape_varieties / grape_varieties_ko / grape_variety / vivino_grapes
    const grapeInputs: string[] = [];
    if (Array.isArray(r.grape_varieties)) grapeInputs.push(...r.grape_varieties);
    if (Array.isArray(r.grape_varieties_ko)) grapeInputs.push(...r.grape_varieties_ko);
    if (typeof r.grape_variety === "string") {
      grapeInputs.push(...r.grape_variety.split(/[,;/]/));
    }
    if (typeof r.vivino_grapes === "string") {
      grapeInputs.push(...r.vivino_grapes.split(/[,;/]/));
    }
    for (const raw of grapeInputs) {
      const s = String(raw).trim();
      if (!s) continue;
      // 비율·괄호 제거 단순화
      const cleaned = s.replace(/\s*\d+(?:\.\d+)?\s*%/g, "").replace(/\s*\([^)]*\)\s*/g, " ").trim();
      if (!cleaned || isHangul(cleaned)) continue;
      if (!isLatin(cleaned)) continue;
      if (!dict.match("grape", cleaned)) {
        grapeUnknowns.add(cleaned.toLowerCase());
      }
    }

    // region (가장 finest 영문)
    const regionInputs = [r.region, r.region_path, r.region_ko];
    for (const v of regionInputs) {
      if (!v) continue;
      const parts = String(v).split(/[/>]/).map((s) => s.trim()).filter(Boolean);
      if (parts.length === 0) continue;
      const finest = parts[parts.length - 1].replace(/\s*\([^)]*\)\s*/g, " ").trim();
      if (!finest || isHangul(finest)) continue;
      if (!isLatin(finest)) continue;
      // path 모든 단계 매칭 시도
      let matched = false;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i].replace(/\s*\([^)]*\)\s*/g, " ").trim();
        if (dict.match("region", p)) {
          matched = true;
          break;
        }
      }
      if (!matched) regionUnknowns.add(finest.toLowerCase());
    }

    // country
    const countryInputs = [r.country, r.country_ko];
    for (const v of countryInputs) {
      if (!v) continue;
      const s = String(v).trim();
      if (!s || isHangul(s) || !isLatin(s)) continue;
      if (!dict.match("country", s)) {
        countryUnknowns.add(s.toLowerCase());
      }
    }

    // producer 한글 미커버 (영문 변환 필요)
    const koProducer = [r.producer, r.producer_ko].find((v) => v && isHangul(String(v)));
    if (koProducer) {
      const s = String(koProducer).trim();
      // 이미 producer_en/winery_en_clean/vivino_winery 영문이 있으면 LLM 불필요
      const hasEn =
        (r.producer_en && isLatin(String(r.producer_en))) ||
        (r.winery_en_clean && isLatin(String(r.winery_en_clean))) ||
        (r.vivino_winery && isLatin(String(r.vivino_winery)));
      // 괄호 안에 영문이 있으면 LLM 불필요 (정규식 추출)
      const parenEn = s.match(/\(([^)]+)\)/);
      const hasParenEn =
        parenEn && /[A-Za-z]/.test(parenEn[1]) && !/[가-힯]/.test(parenEn[1]);
      if (!hasEn && !hasParenEn && !dict.match("winery", s)) {
        producerUnknowns.add(s);
      }
    }
  }

  console.log("\n=== LLM 변환 필요 unique 항목 ===");
  console.log(`grape (영→한):     ${grapeUnknowns.size}`);
  console.log(`region (영→한):    ${regionUnknowns.size}`);
  console.log(`country (영→한):   ${countryUnknowns.size}`);
  console.log(`producer (한→영):  ${producerUnknowns.size}`);
  const total = grapeUnknowns.size + regionUnknowns.size + countryUnknowns.size + producerUnknowns.size;
  console.log(`──────────────────────`);
  console.log(`합계:              ${total}`);

  // 비용 추산 (claude-haiku-4-5 기준, 항목당 ~80 tokens)
  const costPer1K = 0.001 + 0.005 * (30 / 50); // input ~$0.001/1K + output 비례
  const estimatedCost = (total * 80 / 1000) * costPer1K;
  console.log(`\n예상 비용 (claude-haiku, 항목당 ~80 tokens): $${estimatedCost.toFixed(2)}`);

  // 샘플 (각 카테고리 5개)
  const sample = (s: Set<string>, n: number) => [...s].slice(0, n);
  console.log(`\n샘플 grape: ${sample(grapeUnknowns, 5).join(", ")}`);
  console.log(`샘플 region: ${sample(regionUnknowns, 5).join(", ")}`);
  console.log(`샘플 country: ${sample(countryUnknowns, 5).join(", ")}`);
  console.log(`샘플 producer (한→영): ${sample(producerUnknowns, 5).join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
