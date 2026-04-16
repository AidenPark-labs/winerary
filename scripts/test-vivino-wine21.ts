/**
 * wine21 → Vivino 보강 PoC
 *
 * raw_wines에서 wine21 샘플 10건을 뽑아 Vivino 크롤링 성공률 체감
 * DB 쓰기 없음, 결과 콘솔 출력만
 *
 * 실행: npx tsx scripts/test-vivino-wine21.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { writeFileSync } from "fs";
import { crawlSingleWine } from "../src/lib/vivino-crawler";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const SAMPLE_SIZE = 50;
const RESULTS_PATH = "/tmp/vivino_poc_results.json";

interface Row {
  source_id: string;
  name_ko: string;
  name_en: string;
  producer_en: string | null;
}

async function getSample(): Promise<Row[]> {
  // wine21 전체에서 랜덤 offset으로 SAMPLE_SIZE 개 추출
  // 전체 건수: 약 33,722
  const total = 33722;
  const rows: Row[] = [];
  const seen = new Set<number>();
  while (rows.length < SAMPLE_SIZE) {
    let offset: number;
    do {
      offset = Math.floor(Math.random() * total);
    } while (seen.has(offset));
    seen.add(offset);

    const r = await fetch(
      `${URL}/rest/v1/raw_wines?select=source_id,name_ko,name_en,producer_en&source=eq.wine21&name_en=not.is.null&order=source_id.asc&limit=1&offset=${offset}`,
      { headers: H }
    );
    const arr: Row[] = await r.json();
    if (arr[0]?.name_en) rows.push(arr[0]);
  }
  return rows;
}

async function main() {
  console.log(`🍷 wine21 → Vivino 보강 PoC (${SAMPLE_SIZE}건)\n`);

  const sample = await getSample();
  console.log("샘플:");
  sample.forEach((r, i) => {
    console.log(`  [${i + 1}] ${r.name_en} (${r.name_ko})`);
  });
  console.log();

  const results: Array<{
    input: Row;
    success: boolean;
    step?: string;
    error?: string;
    vivinoName?: string;
    rating?: number | null;
    reviews?: number | null;
    grapes?: string;
    region?: string;
    firstScore?: number;
    crossScore?: number;
    durationSec: number;
  }> = [];

  for (let i = 0; i < sample.length; i++) {
    const row = sample[i];
    const start = Date.now();
    process.stdout.write(`[${i + 1}/${sample.length}] ${row.name_en.slice(0, 50)}... `);

    try {
      const result = await crawlSingleWine(row.name_en);
      const durationSec = (Date.now() - start) / 1000;

      if (result.success) {
        console.log(`✅ ${durationSec.toFixed(0)}s → ${result.vivinoName} ⭐${result.rating}`);
        results.push({
          input: row,
          success: true,
          vivinoName: result.vivinoName,
          rating: result.rating,
          reviews: result.reviews,
          grapes: result.facts.grapes,
          region: result.facts.region,
          firstScore: result.matchInfo?.firstMatchScore,
          crossScore: result.matchInfo?.crossMatchScore,
          durationSec,
        });
      } else {
        console.log(`❌ ${durationSec.toFixed(0)}s [${result.step}] ${result.error?.slice(0, 80)}`);
        results.push({
          input: row,
          success: false,
          step: result.step,
          error: result.error,
          durationSec,
        });
      }
    } catch (e: any) {
      console.log(`❌ exception: ${e.message}`);
      results.push({
        input: row,
        success: false,
        step: "exception",
        error: e.message,
        durationSec: (Date.now() - start) / 1000,
      });
    }

    // 중간 저장 (중단 시 보존)
    writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
  }

  const success = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success);

  // 실패 분류
  const byStep: Record<string, number> = {};
  for (const r of failed) {
    const k = r.step || "unknown";
    byStep[k] = (byStep[k] || 0) + 1;
  }

  // 소요 시간 통계
  const durations = results.map((r) => r.durationSec).sort((a, b) => a - b);
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  const p50 = durations[Math.floor(durations.length / 2)];
  const p95 = durations[Math.floor(durations.length * 0.95)];

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`성공: ${success}/${sample.length} (${((success / sample.length) * 100).toFixed(0)}%)`);
  console.log(`소요: 평균 ${avg.toFixed(1)}s / p50 ${p50.toFixed(1)}s / p95 ${p95.toFixed(1)}s`);
  console.log(`실패 단계별:`);
  for (const [step, count] of Object.entries(byStep)) {
    console.log(`  - ${step}: ${count}건`);
  }
  console.log(`\n실패 상세:`);
  failed.forEach((r, i) => {
    console.log(`  [${i + 1}] ${r.input.name_en}`);
    console.log(`      [${r.step}] ${r.error?.slice(0, 120)}`);
  });
  console.log(`\n💾 ${RESULTS_PATH}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
