import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ComparisonRow {
  id: string;
  name_ko: string;
  name_en: string | null;
  field: string;
  naver_value: string | null;
  vivino_value: string | null;
  match_status: "MISMATCH" | "NAVER_ONLY" | "VIVINO_ONLY";
}

async function main() {
  // Fetch all wines that have at least some vivino data (paginate to bypass 1000 limit)
  let wines: any[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error: err } = await supabase
      .from("wines")
      .select(
        "id, name_ko, name_en, wine_type, country, region, grape_variety, producer, vivino_winery, vivino_grapes, vivino_region, vivino_style, vivino_alcohol, vivino_url"
      )
      .not("vivino_url", "is", null)
      .range(from, from + pageSize - 1);
    if (err) {
      console.error("DB 조회 에러:", err);
      process.exit(1);
    }
    wines = wines.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  const error = null;

  if (error) {
    console.error("DB 조회 에러:", error);
    process.exit(1);
  }

  console.log(`Vivino 데이터가 있는 와인 수: ${wines.length}`);

  const comparisons: ComparisonRow[] = [];

  // Field pairs to compare: [label, naverField, vivinoField]
  const fieldPairs: [string, string, string][] = [
    ["포도품종 (grape_variety vs vivino_grapes)", "grape_variety", "vivino_grapes"],
    ["지역 (region vs vivino_region)", "region", "vivino_region"],
    ["생산자 (producer vs vivino_winery)", "producer", "vivino_winery"],
    ["스타일 (wine_type vs vivino_style)", "wine_type", "vivino_style"],
  ];

  for (const wine of wines) {
    for (const [label, naverField, vivinoField] of fieldPairs) {
      const naverVal = (wine as any)[naverField] as string | null;
      const vivinoVal = (wine as any)[vivinoField] as string | null;

      // Both null - skip
      if (!naverVal && !vivinoVal) continue;

      if (naverVal && !vivinoVal) {
        comparisons.push({
          id: wine.id,
          name_ko: wine.name_ko,
          name_en: wine.name_en,
          field: label,
          naver_value: naverVal,
          vivino_value: null,
          match_status: "NAVER_ONLY",
        });
      } else if (!naverVal && vivinoVal) {
        comparisons.push({
          id: wine.id,
          name_ko: wine.name_ko,
          name_en: wine.name_en,
          field: label,
          naver_value: null,
          vivino_value: vivinoVal,
          match_status: "VIVINO_ONLY",
        });
      } else if (naverVal && vivinoVal) {
        // Both exist - these are the ones we want to review
        // Since naver is Korean and vivino is English, we can't do direct comparison
        // Mark all as MISMATCH for manual review
        comparisons.push({
          id: wine.id,
          name_ko: wine.name_ko,
          name_en: wine.name_en,
          field: label,
          naver_value: naverVal,
          vivino_value: vivinoVal,
          match_status: "MISMATCH",
        });
      }
    }
  }

  // Summary - count by unique wines, not by field rows
  const winesWith = (status: string) =>
    new Set(comparisons.filter((c) => c.match_status === status).map((c) => c.id)).size;

  // Per-field breakdown by wine count
  const fieldWineCount = (status: string, fieldKeyword: string) =>
    new Set(
      comparisons
        .filter((c) => c.match_status === status && c.field.includes(fieldKeyword))
        .map((c) => c.id)
    ).size;

  console.log(`\n=== 비교 결과 요약 (와인 수 기준) ===`);
  console.log(`전체 Vivino 데이터 보유 와인: ${wines.length}개`);
  console.log();
  console.log(`양쪽 모두 데이터 있는 와인: ${winesWith("MISMATCH")}개`);
  console.log(`  - 포도품종: ${fieldWineCount("MISMATCH", "grape_variety")}개`);
  console.log(`  - 지역: ${fieldWineCount("MISMATCH", "region")}개`);
  console.log(`  - 생산자: ${fieldWineCount("MISMATCH", "producer")}개`);
  console.log(`  - 스타일: ${fieldWineCount("MISMATCH", "wine_type")}개`);
  console.log();
  console.log(`네이버에만 데이터 있는 와인: ${winesWith("NAVER_ONLY")}개`);
  console.log(`  - 포도품종: ${fieldWineCount("NAVER_ONLY", "grape_variety")}개`);
  console.log(`  - 지역: ${fieldWineCount("NAVER_ONLY", "region")}개`);
  console.log(`  - 생산자: ${fieldWineCount("NAVER_ONLY", "producer")}개`);
  console.log(`  - 스타일: ${fieldWineCount("NAVER_ONLY", "wine_type")}개`);
  console.log();
  console.log(`Vivino에만 데이터 있는 와인: ${winesWith("VIVINO_ONLY")}개`);
  console.log(`  - 포도품종: ${fieldWineCount("VIVINO_ONLY", "grape_variety")}개`);
  console.log(`  - 지역: ${fieldWineCount("VIVINO_ONLY", "region")}개`);
  console.log(`  - 생산자: ${fieldWineCount("VIVINO_ONLY", "producer")}개`);
  console.log(`  - 스타일: ${fieldWineCount("VIVINO_ONLY", "wine_type")}개`);

  // Generate CSV
  const csvHeader =
    "match_status,field,name_ko,name_en,naver_value,vivino_value,id";
  const csvRows = comparisons.map((c) =>
    [
      c.match_status,
      `"${c.field}"`,
      `"${(c.name_ko || "").replace(/"/g, '""')}"`,
      `"${(c.name_en || "").replace(/"/g, '""')}"`,
      `"${(c.naver_value || "").replace(/"/g, '""')}"`,
      `"${(c.vivino_value || "").replace(/"/g, '""')}"`,
      c.id,
    ].join(",")
  );

  const csv = [csvHeader, ...csvRows].join("\n");
  const outPath = "wine-source-comparison.csv";
  fs.writeFileSync(outPath, csv, "utf-8");
  console.log(`\nCSV 파일 생성: ${outPath}`);

  // Also print MISMATCH cases grouped by wine for quick review
  console.log(`\n=== 양쪽 데이터 모두 존재하는 와인 (검토 대상) ===\n`);

  const mismatchByWine = new Map<string, ComparisonRow[]>();
  for (const c of comparisons.filter((c) => c.match_status === "MISMATCH")) {
    if (!mismatchByWine.has(c.id)) mismatchByWine.set(c.id, []);
    mismatchByWine.get(c.id)!.push(c);
  }

  for (const [wineId, rows] of mismatchByWine) {
    const wine = rows[0];
    console.log(`--- ${wine.name_ko} (${wine.name_en || "N/A"}) ---`);
    for (const row of rows) {
      console.log(`  ${row.field}`);
      console.log(`    네이버: ${row.naver_value}`);
      console.log(`    Vivino: ${row.vivino_value}`);
    }
    console.log();
  }

  // Print VIVINO_ONLY cases - these are candidates for backfilling naver data
  console.log(`\n=== Vivino에만 데이터가 있는 필드 (네이버 데이터 없음) ===\n`);
  const vivinoOnlyByWine = new Map<string, ComparisonRow[]>();
  for (const c of comparisons.filter((c) => c.match_status === "VIVINO_ONLY")) {
    if (!vivinoOnlyByWine.has(c.id)) vivinoOnlyByWine.set(c.id, []);
    vivinoOnlyByWine.get(c.id)!.push(c);
  }

  for (const [wineId, rows] of vivinoOnlyByWine) {
    const wine = rows[0];
    console.log(`--- ${wine.name_ko} (${wine.name_en || "N/A"}) ---`);
    for (const row of rows) {
      console.log(`  ${row.field}: ${row.vivino_value}`);
    }
    console.log();
  }
}

main().catch(console.error);
