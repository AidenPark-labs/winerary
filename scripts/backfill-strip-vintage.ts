/**
 * wines.name_ko / name_en의 끝 빈티지(19xx/20xx)를 일괄 제거
 *
 * stripVintage는 본래 dedupe 매칭 키 정규화에만 쓰이다가 promote-v2가 저장 시점에도 적용하도록
 * 수정됐음. 그 이전에 promote된 기존 wines에는 빈티지가 이름에 그대로 남아있음 — 이 backfill로 정리.
 *
 * 동작:
 *   - wines 전체 스캔
 *   - name_ko 또는 name_en이 stripVintage 결과와 다르면 대상
 *   - name_ko UNIQUE 충돌이 예상되면 skip + 로그 (어드민 수동 처리 필요)
 *
 * 모드:
 *   --dry-run (기본): 집계 + 샘플만
 *   --apply         : 실제 UPDATE
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
import { stripVintage } from "../src/lib/wine-dedupe";

config({ path: resolve(process.cwd(), ".env.local") });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const APPLY = process.argv.includes("--apply");

interface WineRow {
  id: string;
  name_ko: string | null;
  name_en: string | null;
}

async function loadAll(): Promise<WineRow[]> {
  const all: WineRow[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb.from("wines").select("id, name_ko, name_en").range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as WineRow[]));
    if (data.length < PAGE) break;
    from += data.length;
  }
  return all;
}

async function main() {
  console.log(`=== backfill-strip-vintage ${APPLY ? "[APPLY]" : "[DRY-RUN]"} ===\n`);

  const all = await loadAll();
  console.log(`wines 총: ${all.length.toLocaleString()}`);

  // 제안된 변경 수집
  interface Change {
    id: string;
    old_ko: string | null;
    new_ko: string | null;
    old_en: string | null;
    new_en: string | null;
  }
  const changes: Change[] = [];
  for (const w of all) {
    const newKo = w.name_ko ? (stripVintage(w.name_ko) || w.name_ko) : w.name_ko;
    const newEn = w.name_en ? (stripVintage(w.name_en) || w.name_en) : w.name_en;
    if (newKo !== w.name_ko || newEn !== w.name_en) {
      changes.push({ id: w.id, old_ko: w.name_ko, new_ko: newKo, old_en: w.name_en, new_en: newEn });
    }
  }
  console.log(`대상: ${changes.length.toLocaleString()}건`);

  // 같은 name_ko로 수렴하는 케이스 (UNIQUE 충돌 예측)
  const targetKoMap = new Map<string, string[]>(); // new_ko → [wine_id]
  for (const c of changes) {
    if (!c.new_ko) continue;
    const arr = targetKoMap.get(c.new_ko) ?? [];
    arr.push(c.id);
    targetKoMap.set(c.new_ko, arr);
  }
  // 기존 wines 중 이 new_ko와 같은 이름이 이미 있으면 (자기 자신 제외) 충돌
  const existingKoMap = new Map<string, string>(); // name_ko → wine_id
  for (const w of all) if (w.name_ko) existingKoMap.set(w.name_ko, w.id);

  const collidingIds = new Set<string>();
  for (const c of changes) {
    if (!c.new_ko) continue;
    const existingId = existingKoMap.get(c.new_ko);
    if (existingId && existingId !== c.id) collidingIds.add(c.id);
    // 변경 대상끼리도 같은 new_ko로 수렴하면 충돌
    const changeSet = targetKoMap.get(c.new_ko) ?? [];
    if (changeSet.length > 1) for (const id of changeSet) collidingIds.add(id);
  }

  console.log(`  UNIQUE 충돌 예상: ${collidingIds.size.toLocaleString()}건 (skip 대상)`);
  console.log(`  실제 적용 가능:   ${(changes.length - collidingIds.size).toLocaleString()}건\n`);

  console.log("━━ 샘플 (최대 20건) ━━");
  const samples = changes.filter((c) => !collidingIds.has(c.id)).slice(0, 20);
  for (const c of samples) {
    if (c.old_ko !== c.new_ko) console.log(`  KO: "${c.old_ko}" → "${c.new_ko}"`);
    if (c.old_en !== c.new_en) console.log(`  EN: "${c.old_en}" → "${c.new_en}"`);
  }

  if (collidingIds.size > 0) {
    console.log("\n━━ 충돌 예시 (최대 5건) ━━");
    const collideSamples = changes.filter((c) => collidingIds.has(c.id)).slice(0, 5);
    for (const c of collideSamples) {
      console.log(`  id=${c.id.slice(0, 8)} "${c.old_ko}" → "${c.new_ko}" (이미 같은 이름 존재)`);
    }
  }

  if (!APPLY) {
    console.log("\n※ DRY-RUN 종료. 실행하려면 --apply");
    return;
  }

  // 실제 적용
  console.log("\n=== UPDATE 실행 ===");
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  for (const c of changes) {
    if (collidingIds.has(c.id)) {
      skipped++;
      continue;
    }
    const patch: Record<string, string | null> = { updated_at: new Date().toISOString() };
    if (c.old_ko !== c.new_ko) patch.name_ko = c.new_ko;
    if (c.old_en !== c.new_en) patch.name_en = c.new_en;
    const { error } = await sb.from("wines").update(patch).eq("id", c.id);
    if (error) {
      errors++;
      if (errors <= 10) console.error(`  [err] id=${c.id.slice(0, 8)}: ${error.message}`);
    } else {
      updated++;
    }
    if ((updated + errors + skipped) % 500 === 0) {
      process.stdout.write(`\r  진행 ${(updated + errors + skipped).toLocaleString()}/${changes.length.toLocaleString()}`);
    }
  }
  console.log();
  console.log(`완료: updated=${updated.toLocaleString()}, skipped=${skipped.toLocaleString()}, errors=${errors.toLocaleString()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
