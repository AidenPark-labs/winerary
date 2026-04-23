/**
 * "wines 전용" 고아 레코드를 위해 raw_wines를 역삽입
 *
 * 배경:
 *   기존 /api/admin/pending-wines route가 편입 승인 시 wines에 직접 INSERT 해왔음.
 *   raw_wines에 대응이 없는 "wines 전용" 와인이 생기는 구조 — 이번 사고의 근본 원인 재발 위험.
 *   감사 결과 3건(data_source='user_submission'인데 raw_wines.promoted_wine_id로 연결 안 됨) 발견.
 *
 * 이 스크립트:
 *   해당 wines의 데이터로 raw_wines(source='user_submission', source_id=wine_id) row를 역삽입해서
 *   불변식 "모든 wines는 raw_wines에 대응" 복구.
 *
 * 모드:
 *   --dry-run (기본)
 *   --apply
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`=== backfill-orphan-wines-to-raw ${APPLY ? "[APPLY]" : "[DRY-RUN]"} ===\n`);

  // data_source='user_submission' wines 전체
  const { data: usWines, error } = await sb
    .from("wines")
    .select("id, name_ko, name_en, wine_type, country, country_ko, region, grape_varieties, grape_variety, producer_ko, producer_en, producer, image_url, created_at")
    .eq("data_source", "user_submission");
  if (error) { console.error(error.message); process.exit(1); }

  // 각각 raw_wines.promoted_wine_id로 연결되어 있는지 확인
  const orphans: typeof usWines = [];
  for (const w of usWines ?? []) {
    const { data: raw } = await sb
      .from("raw_wines")
      .select("id")
      .eq("promoted_wine_id", w.id)
      .limit(1);
    if (!raw || raw.length === 0) orphans.push(w);
  }

  console.log(`전체 user_submission wines: ${usWines?.length ?? 0}`);
  console.log(`고아 (raw_wines 대응 없음): ${orphans.length}`);

  for (const w of orphans) {
    console.log(`  - ${w.name_ko} (${w.id.slice(0, 8)})`);
  }

  if (orphans.length === 0) {
    console.log("\n고아 없음. 종료.");
    return;
  }

  if (!APPLY) {
    console.log("\n※ DRY-RUN 종료. --apply 로 실행.");
    return;
  }

  console.log("\n=== raw_wines 역삽입 ===");
  let ok = 0;
  let err = 0;
  for (const w of orphans) {
    const grapeVariety = Array.isArray(w.grape_varieties) && w.grape_varieties.length > 0
      ? w.grape_varieties.join(", ")
      : (w.grape_variety ?? null);
    const payload = {
      source: "user_submission",
      source_id: w.id, // wines.id를 source_id로 사용 — 고유 보장
      name_ko: w.name_ko,
      name_en: w.name_en,
      wine_type: w.wine_type,
      country: w.country_ko ?? w.country,
      region: w.region,
      grape_variety: grapeVariety,
      producer: w.producer_ko ?? w.producer_en ?? w.producer,
      producer_ko: w.producer_ko,
      producer_en: w.producer_en,
      image_url: w.image_url,
      raw_payload: { backfilled_from_wines: true, backfilled_at: new Date().toISOString(), wine_id: w.id },
      promoted_wine_id: w.id,
      promoted_at: w.created_at ?? new Date().toISOString(),
    };
    const { error } = await sb.from("raw_wines").insert(payload);
    if (error) {
      err++;
      console.error(`  [err] wine ${w.id.slice(0, 8)}: ${error.message}`);
    } else {
      ok++;
    }
  }
  console.log(`\n완료: inserted=${ok}, errors=${err}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
