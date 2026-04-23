/**
 * wines.grape_varieties_ko 전체 백필.
 *
 * term_dict(category='grape')의 ko가 변경됐을 때 재계산.
 * 각 wine의 grape_varieties(영문 배열)를 term_dict.en으로 lookup → 표준 ko 배열 생성.
 *
 * 모드:
 *   --apply (기본 dry-run)
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
import { loadGrapeDict, normalizeGrapes } from "../src/lib/grape-normalize";

config({ path: resolve(process.cwd(), ".env.local") });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`=== backfill-grape-varieties-ko ${APPLY ? "[APPLY]" : "[DRY-RUN]"} ===\n`);

  console.log("term_dict grape 로드 중...");
  const dict = await loadGrapeDict(sb);
  console.log(`  grape 엔트리: ${dict.length}개\n`);

  const all: Array<{ id: string; grape_varieties: string[] | null; grape_varieties_ko: string[] | null }> = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb
      .from("wines")
      .select("id, grape_varieties, grape_varieties_ko")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as typeof all));
    if (data.length < PAGE) break;
    from += data.length;
  }
  console.log(`wines 총: ${all.length.toLocaleString()}\n`);

  type Change = { id: string; old_ko: string[]; new_ko: string[] };
  const changes: Change[] = [];
  let skipNoGrapes = 0;

  for (const w of all) {
    const gv = Array.isArray(w.grape_varieties) ? w.grape_varieties : [];
    if (gv.length === 0) { skipNoGrapes++; continue; }
    const result = normalizeGrapes(gv, dict);
    const newKo = result.normalized_ko;
    const oldKo = Array.isArray(w.grape_varieties_ko) ? w.grape_varieties_ko : [];
    // 배열 내용 비교 (순서 + 값)
    const same = newKo.length === oldKo.length && newKo.every((v, i) => v === oldKo[i]);
    if (!same) changes.push({ id: w.id, old_ko: oldKo, new_ko: newKo });
  }

  console.log(`품종 없음 skip: ${skipNoGrapes}`);
  console.log(`변경 대상: ${changes.length}\n`);

  console.log("샘플 변경 (최대 15):");
  for (const c of changes.slice(0, 15)) {
    console.log(`  ${c.id.slice(0, 8)}  ${JSON.stringify(c.old_ko)} → ${JSON.stringify(c.new_ko)}`);
  }

  if (!APPLY) {
    console.log("\n※ DRY-RUN. 실행: --apply");
    return;
  }

  console.log("\n=== UPDATE 실행 ===");
  let updated = 0;
  let errors = 0;
  for (const c of changes) {
    const { error } = await sb
      .from("wines")
      .update({ grape_varieties_ko: c.new_ko, updated_at: new Date().toISOString() })
      .eq("id", c.id);
    if (error) {
      errors++;
      if (errors <= 5) console.error(`  [err] ${c.id.slice(0, 8)}: ${error.message}`);
    } else {
      updated++;
    }
    if ((updated + errors) % 500 === 0) process.stdout.write(`\r  진행 ${updated + errors}/${changes.length}`);
  }
  console.log();
  console.log(`\n완료: updated=${updated}, errors=${errors}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
