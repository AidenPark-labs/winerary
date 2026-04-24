/**
 * wine_records.grape_variety (legacy string) → grape_varieties[] / grape_varieties_ko[] 백필
 *
 * 파싱:
 *   "블렌드 (까베르네 소비뇽, 메를로)" → ["까베르네 소비뇽", "메를로"]
 *   "샤도네" → ["샤도네"] → (term_dict 매칭) → ["Chardonnay"] / ["샤르도네"]
 *   "카베르네, 메를로" → ["카베르네", "메를로"]
 *
 * pending_wines.grape_variety에도 동일 백필.
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

function parseLegacy(gv: string | null | undefined): string[] {
  if (!gv) return [];
  const trimmed = String(gv).trim();
  if (!trimmed) return [];
  const blend = trimmed.match(/^블렌드\s*\((.+)\)\s*$/);
  if (blend) {
    return blend[1].split(/[,;/]/).map((s) => s.trim()).filter(Boolean);
  }
  return trimmed.split(/[,;/]/).map((s) => s.trim()).filter(Boolean);
}

async function main() {
  console.log(`=== backfill-wine-records-grapes ${APPLY ? "[APPLY]" : "[DRY-RUN]"} ===\n`);
  const dict = await loadGrapeDict(sb);
  console.log(`grape dict: ${dict.length}개\n`);

  for (const table of ["wine_records", "pending_wines"] as const) {
    console.log(`\n━━━ ${table} ━━━`);
    const all: Array<{ id: string; grape_variety: string | null; grape_varieties: string[] | null; grape_varieties_ko: string[] | null }> = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await sb
        .from(table)
        .select("id, grape_variety, grape_varieties, grape_varieties_ko")
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...(data as typeof all));
      if (data.length < PAGE) break;
      from += data.length;
    }
    console.log(`  total rows: ${all.length}`);

    type Change = { id: string; new_en: string[]; new_ko: string[]; unknowns: string[] };
    const changes: Change[] = [];
    let skipNoLegacy = 0;
    let skipAlreadyHasArr = 0;

    for (const r of all) {
      const rawGrapes = parseLegacy(r.grape_variety);
      if (rawGrapes.length === 0) { skipNoLegacy++; continue; }
      const hasArr = Array.isArray(r.grape_varieties) && r.grape_varieties.length > 0;
      if (hasArr) { skipAlreadyHasArr++; continue; }
      const res = normalizeGrapes(rawGrapes, dict);
      const newEn = res.normalized_en.length > 0 ? res.normalized_en : rawGrapes;
      const newKo = res.normalized_ko.length > 0 ? res.normalized_ko : rawGrapes;
      changes.push({ id: r.id, new_en: newEn, new_ko: newKo, unknowns: res.unknowns });
    }

    console.log(`  legacy 없음 skip: ${skipNoLegacy}`);
    console.log(`  이미 배열 있음 skip: ${skipAlreadyHasArr}`);
    console.log(`  변경 대상: ${changes.length}`);

    if (changes.length > 0) {
      console.log(`  샘플 5:`);
      for (const c of changes.slice(0, 5)) {
        console.log(`    ${c.id.slice(0, 8)}  en=${JSON.stringify(c.new_en)} ko=${JSON.stringify(c.new_ko)}${c.unknowns.length > 0 ? ` unknowns=${JSON.stringify(c.unknowns)}` : ""}`);
      }
    }

    if (!APPLY) continue;

    let updated = 0, errors = 0;
    for (const c of changes) {
      const { error } = await sb
        .from(table)
        .update({
          grape_varieties: c.new_en,
          grape_varieties_ko: c.new_ko,
          updated_at: new Date().toISOString(),
        })
        .eq("id", c.id);
      if (error) { errors++; if (errors <= 3) console.error(`    err: ${error.message}`); }
      else updated++;
    }
    console.log(`  completed: updated=${updated}, errors=${errors}`);
  }

  if (!APPLY) console.log("\n※ DRY-RUN. 실행: --apply");
}

main().catch((e) => { console.error(e); process.exit(1); });
