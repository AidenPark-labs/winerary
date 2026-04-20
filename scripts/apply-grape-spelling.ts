/**
 * 프랑스어 품종 된소리 표기 적용:
 *   Cabernet* 카베르네 → 까베르네
 *   Carmenère 카르메네르 → 까르메네르
 *   Carignan/Cariñena 카리녜나 → 까리녜나
 *
 * 3단계:
 *   1) term_dict.ko UPDATE (+ 기존 표기를 aliases에 추가)
 *   2) wines.grape_varieties_ko 배열 내 값 치환
 *   3) wine_records.grape_variety 치환
 *
 * 실행:
 *   NODE_ENV=development npx tsx scripts/apply-grape-spelling.ts --dry-run
 *   NODE_ENV=development npx tsx scripts/apply-grape-spelling.ts
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const DRY_RUN = process.argv.includes("--dry-run");

// en 기준으로 변경 대상 정의 (ko만 바꿈, en은 그대로)
const CHANGES: Array<{ en: string; oldKo: string; newKo: string }> = [
  { en: "Cabernet Sauvignon", oldKo: "카베르네 소비뇽", newKo: "까베르네 소비뇽" },
  { en: "Cabernet Franc", oldKo: "카베르네 프랑", newKo: "까베르네 프랑" },
  { en: "Cabernet Blanc", oldKo: "카베르네 블랑", newKo: "까베르네 블랑" },
  { en: "Cabernet d'Anjou", oldKo: "카베르네 당주", newKo: "까베르네 당주" },
  { en: "Carmenère", oldKo: "카르메네르", newKo: "까르메네르" },
  { en: "Carménère", oldKo: "카르메네르", newKo: "까르메네르" },
  { en: "Carinena", oldKo: "카리녜나", newKo: "까리녜나" },
  { en: "Cariñena", oldKo: "카리녜나", newKo: "까리녜나" },
];

// oldKo → newKo 매핑 (중복 제거)
const REPLACE_MAP = new Map<string, string>();
for (const c of CHANGES) REPLACE_MAP.set(c.oldKo, c.newKo);

async function main() {
  console.log(`${DRY_RUN ? "[DRY-RUN]" : "[EXEC]"} 프랑스어 품종 된소리 표기 적용\n`);

  // ─── 1) term_dict UPDATE ─────────────────────────────────────
  console.log("=== 1) term_dict 업데이트 ===");
  for (const c of CHANGES) {
    const { data: row, error: selErr } = await sb
      .from("term_dict")
      .select("category, en, ko, aliases")
      .eq("category", "grape")
      .eq("en", c.en)
      .maybeSingle();
    if (selErr) { console.error(`  ❌ ${c.en}: ${selErr.message}`); continue; }
    if (!row) { console.log(`  ⏭  ${c.en}: 엔트리 없음 — skip`); continue; }

    const currentKo = row.ko as string;
    if (currentKo === c.newKo) {
      console.log(`  ✓ ${c.en}: 이미 ${c.newKo}`);
      continue;
    }

    const aliases: string[] = Array.isArray(row.aliases) ? [...row.aliases] : [];
    // 기존 ko를 alias에 보존 (검색 호환)
    if (currentKo && !aliases.includes(currentKo)) aliases.push(currentKo);
    // newKo가 이미 aliases에 있으면 제거 (중복 방지)
    const cleanedAliases = aliases.filter((a) => a !== c.newKo);

    console.log(`  → ${c.en}: ${currentKo} → ${c.newKo}  (alias 추가: ${currentKo})`);
    if (!DRY_RUN) {
      const { error } = await sb
        .from("term_dict")
        .update({ ko: c.newKo, aliases: cleanedAliases })
        .eq("category", "grape")
        .eq("en", c.en);
      if (error) console.error(`    ❌ ${error.message}`);
    }
  }

  // ─── 2) wines.grape_varieties_ko 배열 치환 ────────────────────
  console.log("\n=== 2) wines.grape_varieties_ko 치환 ===");
  const wineTargets: Array<{ id: string; grape_varieties_ko: string[] }> = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from("wines")
      .select("id, grape_varieties_ko")
      .not("grape_varieties_ko", "is", null)
      .order("id")
      .range(offset, offset + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const w of data) {
      const gv = (w.grape_varieties_ko ?? []) as string[];
      if (gv.some((g) => REPLACE_MAP.has(g))) {
        wineTargets.push({ id: w.id as string, grape_varieties_ko: gv });
      }
    }
    if (data.length < 1000) break;
    offset += data.length;
  }
  console.log(`대상 wines: ${wineTargets.length}건`);

  let wineUpdated = 0, wineErrors = 0;
  for (const w of wineTargets) {
    const newGv = w.grape_varieties_ko.map((g) => REPLACE_MAP.get(g) ?? g);
    // 중복 제거 순서 유지
    const dedup: string[] = [];
    for (const g of newGv) if (!dedup.includes(g)) dedup.push(g);
    if (DRY_RUN) { wineUpdated++; continue; }
    const { error } = await sb.from("wines").update({ grape_varieties_ko: dedup }).eq("id", w.id);
    if (error) { wineErrors++; console.error(`  ❌ ${w.id}: ${error.message}`); } else wineUpdated++;
    if ((wineUpdated + wineErrors) % 50 === 0) process.stdout.write(`\r  ${wineUpdated + wineErrors}/${wineTargets.length}`);
  }
  process.stdout.write("\n");
  console.log(`  성공: ${wineUpdated}  에러: ${wineErrors}`);

  // ─── 3) wine_records.grape_variety (string) 치환 ──────────────
  console.log("\n=== 3) wine_records.grape_variety 치환 ===");

  // "블렌드 (카베르네 소비뇽, ...)" 형태도 처리
  // 정확 일치 + 부분 치환 병행: 부분 치환은 "블렌드 (...)" 내부에서 의미 있음
  // 간단 접근: 각 oldKo 문자열을 newKo로 치환 (단어 경계 신경 안 써도 케이스 충돌 없음)

  // 먼저 정확 일치 대상 집계
  const recordTargets: Array<{ id: string; grape_variety: string; newValue: string }> = [];
  offset = 0;
  while (true) {
    const { data, error } = await sb
      .from("wine_records")
      .select("id, grape_variety")
      .not("grape_variety", "is", null)
      .order("id")
      .range(offset, offset + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      const orig = r.grape_variety as string;
      let next = orig;
      for (const [oldKo, newKo] of REPLACE_MAP) {
        if (next.includes(oldKo)) next = next.split(oldKo).join(newKo);
      }
      if (next !== orig) {
        recordTargets.push({ id: r.id as string, grape_variety: orig, newValue: next });
      }
    }
    if (data.length < 1000) break;
    offset += data.length;
  }
  console.log(`대상 wine_records: ${recordTargets.length}건`);
  if (recordTargets.length > 0) {
    console.log(`[샘플 5건]`);
    for (const t of recordTargets.slice(0, 5)) {
      console.log(`  "${t.grape_variety}" → "${t.newValue}"`);
    }
  }

  let recUpdated = 0, recErrors = 0;
  for (const t of recordTargets) {
    if (DRY_RUN) { recUpdated++; continue; }
    const { error } = await sb.from("wine_records").update({ grape_variety: t.newValue }).eq("id", t.id);
    if (error) { recErrors++; } else recUpdated++;
    if ((recUpdated + recErrors) % 50 === 0) process.stdout.write(`\r  ${recUpdated + recErrors}/${recordTargets.length}`);
  }
  process.stdout.write("\n");
  console.log(`  성공: ${recUpdated}  에러: ${recErrors}`);

  // ─── 4) pending_wines.grape_variety도 동일 처리 ──────────────
  console.log("\n=== 4) pending_wines.grape_variety 치환 ===");
  const pendTargets: Array<{ id: string; grape_variety: string; newValue: string }> = [];
  offset = 0;
  while (true) {
    const { data, error } = await sb
      .from("pending_wines")
      .select("id, grape_variety")
      .not("grape_variety", "is", null)
      .order("id")
      .range(offset, offset + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      const orig = r.grape_variety as string;
      let next = orig;
      for (const [oldKo, newKo] of REPLACE_MAP) {
        if (next.includes(oldKo)) next = next.split(oldKo).join(newKo);
      }
      if (next !== orig) {
        pendTargets.push({ id: r.id as string, grape_variety: orig, newValue: next });
      }
    }
    if (data.length < 1000) break;
    offset += data.length;
  }
  console.log(`대상 pending_wines: ${pendTargets.length}건`);

  let pendUpdated = 0, pendErrors = 0;
  for (const t of pendTargets) {
    if (DRY_RUN) { pendUpdated++; continue; }
    const { error } = await sb.from("pending_wines").update({ grape_variety: t.newValue }).eq("id", t.id);
    if (error) { pendErrors++; } else pendUpdated++;
  }
  console.log(`  성공: ${pendUpdated}  에러: ${pendErrors}`);

  console.log(`\n✅ 완료`);
}

main().catch((e) => { console.error(e); process.exit(1); });
