/**
 * grape_variety 데이터 정규화 마이그레이션
 *
 * 1. 쉼표로 구분된 복수 품종 → "블렌드 (품종1, 품종2)" 형태로 변환
 * 2. 표기 불일치 동의어 정규화 (시라즈 → 시라/쉬라즈, 피노누아 → 피노 누아 등)
 *
 * 실행: npx tsx scripts/migrate-grape-variety.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 동의어 → 정규화된 품종명
const SYNONYMS: Record<string, string> = {
  "시라즈": "시라/쉬라즈",
  "쉬라즈": "시라/쉬라즈",
  "시라": "시라/쉬라즈",
  "피노누아": "피노 누아",
  "카베르네 소비뇽": "까베르네 소비뇽",
  "카베르네 프랑": "까베르네 프랑",
  "까베르네소비뇽": "까베르네 소비뇽",
  "피노그리지오": "피노 그리지오",
  "소비뇽블랑": "소비뇽 블랑",
  "네로디트로이아": "네로 디 트로이아",
};

function normalize(grape: string): string {
  const trimmed = grape.trim();
  return SYNONYMS[trimmed] ?? trimmed;
}

async function main() {
  console.log("🍇 grape_variety 데이터 정규화 시작\n");

  const { data: records, error } = await supabase
    .from("wine_records")
    .select("id, grape_variety")
    .not("grape_variety", "is", null);

  if (error || !records) {
    console.error("조회 실패:", error?.message);
    return;
  }

  let updated = 0;
  let skipped = 0;

  for (const record of records) {
    const original = record.grape_variety as string;
    const parts = original.split(",").map((s) => s.trim()).filter(Boolean);

    let newValue: string;

    if (parts.length > 1) {
      // 복수 품종 → 블렌드
      const normalized = parts.map(normalize);
      newValue = `블렌드 (${normalized.join(", ")})`;
    } else {
      // 단일 품종 → 동의어 정규화
      newValue = normalize(original);
    }

    if (newValue !== original) {
      const { error: updateError } = await supabase
        .from("wine_records")
        .update({ grape_variety: newValue })
        .eq("id", record.id);

      if (updateError) {
        console.log(`  ✗ ${record.id.slice(0, 8)} | 실패: ${updateError.message}`);
      } else {
        console.log(`  ✓ "${original}" → "${newValue}"`);
        updated++;
      }
    } else {
      skipped++;
    }
  }

  console.log(`\n완료! 변경 ${updated}건 / 유지 ${skipped}건 / 전체 ${records.length}건`);
}

main().catch(console.error);
