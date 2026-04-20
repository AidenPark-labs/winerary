/**
 * Phase 1 Step 2: term_dict 번역 대상 용어 추출 (READ-ONLY)
 *
 * 실행: NODE_ENV=development npx tsx scripts/extract-term-candidates.ts
 *
 * 대상 소스:
 *   - wines.country, wines.region (legacy 소스)
 *   - wines.grape_variety (쉼표 분리)
 *   - raw_wines.country, raw_wines.vivino_region, raw_wines.region
 *   - raw_wines.vivino_style
 *   - raw_wines.raw_payload.parsed_grape_varieties[] (배열)
 *   - raw_wines.raw_payload.parsed_wine_style
 *   - raw_wines.vivino_grapes (쉼표 분리)
 *   - raw_wines.grape_variety (쉼표 분리)
 *
 * 출력:
 *   - backup/v3-phase1-terms-<timestamp>.json
 *   - 카테고리별: { term, count, samples? }
 *
 * ※ 쓰기 없음. LLM 번역 대상 목록 확보가 목적.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PAGE = 1000;

type TermCounts = Map<string, number>; // key: normalized lower-trim, value: count

function addTerm(map: TermCounts, term: string | null | undefined, originalCase: Map<string, string>): void {
  if (!term) return;
  const trimmed = String(term).trim();
  if (!trimmed) return;
  const key = trimmed.toLowerCase();
  map.set(key, (map.get(key) ?? 0) + 1);
  if (!originalCase.has(key)) originalCase.set(key, trimmed);
}

function splitCommaList(s: string | null | undefined): string[] {
  if (!s) return [];
  return String(s)
    .split(/[,;/]/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  Phase 1: term_dict 번역 대상 용어 추출");
  console.log("═══════════════════════════════════════════════════\n");

  const country: TermCounts = new Map();
  const countryOrig = new Map<string, string>();
  const region: TermCounts = new Map();
  const regionOrig = new Map<string, string>();
  const grape: TermCounts = new Map();
  const grapeOrig = new Map<string, string>();
  const style: TermCounts = new Map();
  const styleOrig = new Map<string, string>();

  // ─── wines 스캔 ───
  console.log("[wines] 스캔 중...");
  let offset = 0;
  let total = 0;
  while (true) {
    const { data, error } = await sb
      .from("wines")
      .select("country, region, grape_variety")
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const r of data) {
      addTerm(country, r.country as string, countryOrig);
      addTerm(region, r.region as string, regionOrig);
      for (const g of splitCommaList(r.grape_variety as string)) {
        addTerm(grape, g, grapeOrig);
      }
    }
    total += data.length;
    process.stdout.write(`\r  진행: ${total.toLocaleString()}  `);
    if (data.length < PAGE) break;
    offset += data.length;
  }
  process.stdout.write("\n  완료\n\n");

  // ─── raw_wines 스캔 (raw_payload 포함, vivino_*는 payload 안에 있음) ───
  console.log("[raw_wines] 스캔 중... (raw_payload 포함이라 시간 걸림)");
  offset = 0;
  total = 0;
  while (true) {
    const { data, error } = await sb
      .from("raw_wines")
      .select("country, region, grape_variety, raw_payload")
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const r of data) {
      addTerm(country, r.country as string, countryOrig);
      addTerm(region, r.region as string, regionOrig);

      for (const g of splitCommaList(r.grape_variety as string)) {
        addTerm(grape, g, grapeOrig);
      }

      const payload = r.raw_payload as Record<string, unknown> | null;
      if (payload) {
        // Vivino 데이터 (모두 raw_payload 안)
        if (typeof payload.vivino_region === "string") addTerm(region, payload.vivino_region, regionOrig);
        if (typeof payload.vivino_style === "string") addTerm(style, payload.vivino_style, styleOrig);
        if (typeof payload.vivino_grapes === "string") {
          for (const g of splitCommaList(payload.vivino_grapes)) {
            addTerm(grape, g, grapeOrig);
          }
        }

        // LLM 파싱 결과 (배열 및 문자열)
        const parsedGrapes = payload.parsed_grape_varieties;
        if (Array.isArray(parsedGrapes)) {
          for (const g of parsedGrapes) {
            if (typeof g === "string") addTerm(grape, g, grapeOrig);
          }
        }
        const parsedStyle = payload.parsed_wine_style;
        if (typeof parsedStyle === "string") addTerm(style, parsedStyle, styleOrig);
      }
    }
    total += data.length;
    process.stdout.write(`\r  진행: ${total.toLocaleString()}  `);
    if (data.length < PAGE) break;
    offset += data.length;
  }
  process.stdout.write("\n  완료\n\n");

  // ─── 집계 ───
  console.log("═══════════════════════════════════════════════════");
  console.log("  추출 결과 요약");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  country:  ${country.size.toLocaleString()} 고유 용어`);
  console.log(`  region:   ${region.size.toLocaleString()} 고유 용어`);
  console.log(`  grape:    ${grape.size.toLocaleString()} 고유 용어`);
  console.log(`  style:    ${style.size.toLocaleString()} 고유 용어`);
  console.log(`  ── 합계:  ${(country.size + region.size + grape.size + style.size).toLocaleString()} 번역 대상`);

  // 상위 10개씩 샘플
  function top10(map: TermCounts, orig: Map<string, string>): Array<{ term: string; count: number }> {
    return Array.from(map.entries())
      .map(([key, count]) => ({ term: orig.get(key) ?? key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  console.log("\n[country 상위 10]");
  for (const x of top10(country, countryOrig)) console.log(`  ${x.count.toString().padStart(6)}  ${x.term}`);
  console.log("\n[region 상위 10]");
  for (const x of top10(region, regionOrig)) console.log(`  ${x.count.toString().padStart(6)}  ${x.term}`);
  console.log("\n[grape 상위 10]");
  for (const x of top10(grape, grapeOrig)) console.log(`  ${x.count.toString().padStart(6)}  ${x.term}`);
  console.log("\n[style 상위 10]");
  for (const x of top10(style, styleOrig)) console.log(`  ${x.count.toString().padStart(6)}  ${x.term}`);

  // ─── 저장 ───
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = path.join(process.cwd(), "backup");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `v3-phase1-terms-${ts}.json`);

  function entriesArray(map: TermCounts, orig: Map<string, string>) {
    return Array.from(map.entries())
      .map(([key, count]) => ({ term: orig.get(key) ?? key, count }))
      .sort((a, b) => b.count - a.count);
  }

  const output = {
    timestamp: new Date().toISOString(),
    source: "wines + raw_wines (raw_payload 포함)",
    totals: {
      country: country.size,
      region: region.size,
      grape: grape.size,
      style: style.size,
    },
    terms: {
      country: entriesArray(country, countryOrig),
      region: entriesArray(region, regionOrig),
      grape: entriesArray(grape, grapeOrig),
      style: entriesArray(style, styleOrig),
    },
  };
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n💾 저장: ${outPath}`);
  console.log(`   (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
