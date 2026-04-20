/**
 * v3 필수 필드 커버리지 체크 (READ-ONLY)
 *
 * 5개 필수 필드: name_ko, name_en, wine_type, grape_variety, country
 *
 * 확인:
 *   1. wines 중 5개 필드 모두 충족 건수 (전체 및 data_source별)
 *   2. wines 기준 미달 행 중 wine_records에서 참조되는 것
 *   3. raw_wines 중 5개 필드 모두 충족 건수 (source별) — promote 가능한 후보
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PAGE = 1000;

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  v3 필수 필드 커버리지 체크");
  console.log("  (name_ko, name_en, wine_type, grape_variety, country)");
  console.log("═══════════════════════════════════════════════════\n");

  // ─── 1. wines 전체: 5개 필드 모두 충족 건수 ───
  console.log("【1. wines 필수 필드 커버리지】 (data_source별)");

  for (const src of [null, "wine21", "naver_shopping", "winenara", "user_submission"]) {
    const label = src ?? "(전체)";

    let base = sb.from("wines").select("*", { count: "exact", head: true });
    if (src) base = base.eq("data_source", src);
    const { count: total } = await base;

    // 5개 모두 충족
    let q = sb
      .from("wines")
      .select("*", { count: "exact", head: true })
      .not("name_ko", "is", null)
      .not("name_en", "is", null)
      .not("wine_type", "is", null)
      .not("grape_variety", "is", null)
      .not("country", "is", null);
    if (src) q = q.eq("data_source", src);
    const { count: allOk } = await q;

    // 각 필드별 누락 건수 (교차는 아니고 단일 기준)
    const missing: Record<string, number> = {};
    for (const field of ["name_ko", "name_en", "wine_type", "grape_variety", "country"]) {
      let mq = sb.from("wines").select("*", { count: "exact", head: true }).is(field, null);
      if (src) mq = mq.eq("data_source", src);
      const { count: c } = await mq;
      missing[field] = c ?? 0;
    }

    console.log(`  ${label}:`);
    console.log(`    전체:              ${(total ?? 0).toLocaleString()}`);
    console.log(`    5개 모두 충족:    ${(allOk ?? 0).toLocaleString()} (${pct(allOk ?? 0, total ?? 1)})`);
    console.log(`    기준 미달:         ${((total ?? 0) - (allOk ?? 0)).toLocaleString()}`);
    console.log(`      누락 필드별:`);
    for (const [f, c] of Object.entries(missing)) {
      console.log(`        ${f.padEnd(16)} ${c.toLocaleString()} (${pct(c, total ?? 1)})`);
    }
  }

  // ─── 2. 기준 미달 wines 중 wine_records/wishlist에서 참조되는 것 ───
  // 역방향 접근: wine_records/wishlist의 wine_id 목록을 먼저 뽑고, 그 와인들의 상태를 확인
  console.log("\n【2. wine_records/wishlist 참조 영향 분석】");

  // 살아있는 wine_records의 wine_id 목록
  const { data: recordRefs } = await sb
    .from("wine_records")
    .select("id, wine_id, name")
    .not("wine_id", "is", null)
    .is("deleted_at", null);
  const recordWineIds = Array.from(new Set((recordRefs ?? []).map((r) => r.wine_id as string)));
  console.log(`  살아있는 wine_records 중 wine_id 보유: ${(recordRefs ?? []).length}건 (유니크 wine: ${recordWineIds.length})`);

  // wishlist의 wine_id 목록
  const { data: wishRefs } = await sb
    .from("wine_wishlist")
    .select("id, wine_id")
    .not("wine_id", "is", null);
  const wishWineIds = Array.from(new Set((wishRefs ?? []).map((r) => r.wine_id as string)));
  console.log(`  wine_wishlist 중 wine_id 보유:         ${(wishRefs ?? []).length}건 (유니크: ${wishWineIds.length})`);

  // 참조된 wine들의 상태 확인
  const refIds = Array.from(new Set([...recordWineIds, ...wishWineIds]));
  if (refIds.length === 0) {
    console.log("  참조되는 wine_id 없음");
  } else {
    const { data: refWines, error } = await sb
      .from("wines")
      .select("id, name_ko, name_en, wine_type, grape_variety, country, data_source")
      .in("id", refIds);
    if (error) throw error;

    let refMissing = 0;
    const missingSamples: Array<{ id: string; missing: string[]; src: string | null; name: string | null }> = [];
    for (const w of refWines ?? []) {
      const missing: string[] = [];
      if (!w.name_ko) missing.push("name_ko");
      if (!w.name_en) missing.push("name_en");
      if (!w.wine_type) missing.push("wine_type");
      if (!w.grape_variety) missing.push("grape_variety");
      if (!w.country) missing.push("country");
      if (missing.length > 0) {
        refMissing++;
        if (missingSamples.length < 10) {
          missingSamples.push({
            id: w.id as string,
            missing,
            src: w.data_source as string | null,
            name: (w.name_ko as string | null) ?? (w.name_en as string | null),
          });
        }
      }
    }
    console.log(`\n  참조되는 wine 총 ${(refWines ?? []).length}건 중 기준 미달: ${refMissing}건`);
    if (missingSamples.length > 0) {
      console.log(`  (샘플):`);
      for (const s of missingSamples) {
        console.log(`    [${s.src}] ${s.name} — 누락: ${s.missing.join(", ")}`);
      }
    }
  }

  // ─── 3. raw_wines 중 5개 필드 모두 충족 건수 ───
  console.log("\n【3. raw_wines 필수 필드 커버리지】 (source별 — promote 가능 후보)");

  for (const src of ["wine21", "gangnam"]) {
    const { count: total } = await sb
      .from("raw_wines")
      .select("*", { count: "exact", head: true })
      .eq("source", src);
    const { count: allOk } = await sb
      .from("raw_wines")
      .select("*", { count: "exact", head: true })
      .eq("source", src)
      .not("name_ko", "is", null)
      .not("name_en", "is", null)
      .not("wine_type", "is", null)
      .not("grape_variety", "is", null)
      .not("country", "is", null);
    const missing: Record<string, number> = {};
    for (const field of ["name_ko", "name_en", "wine_type", "grape_variety", "country"]) {
      const { count: c } = await sb
        .from("raw_wines")
        .select("*", { count: "exact", head: true })
        .eq("source", src)
        .is(field, null);
      missing[field] = c ?? 0;
    }
    console.log(`  ${src}:`);
    console.log(`    전체:              ${(total ?? 0).toLocaleString()}`);
    console.log(`    5개 모두 충족:    ${(allOk ?? 0).toLocaleString()} (${pct(allOk ?? 0, total ?? 1)})`);
    console.log(`      누락 필드별:`);
    for (const [f, c] of Object.entries(missing)) {
      console.log(`        ${f.padEnd(16)} ${c.toLocaleString()} (${pct(c, total ?? 1)})`);
    }
  }

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  커버리지 체크 완료");
  console.log("═══════════════════════════════════════════════════");
}

function pct(n: number, total: number): string {
  if (total === 0) return "0.0%";
  return `${((n / total) * 100).toFixed(1)}%`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
