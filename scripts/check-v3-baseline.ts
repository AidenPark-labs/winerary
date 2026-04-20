/**
 * v3 재설계 착수 전 baseline 체크 스크립트 (READ-ONLY)
 *
 * 실행: NODE_ENV=development npx tsx scripts/check-v3-baseline.ts
 *
 * 출력:
 *  - wines / raw_wines / wine_records / pending_wines / record_evaluations 건수
 *  - 역이관 대상 (wines 중 raw_wines promoted_wine_id에 없는 행)
 *  - wines의 data_source별 분포 (winenara/naver/wine21/...)
 *  - Vivino/LLM enrichment 커버리지
 *  - 평가 이관 대상 (wine_records.rating 등 NOT NULL 건수)
 *
 * ※ 어떤 쓰기도 하지 않음. 프로덕션 DB에서 안전하게 실행 가능.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function count(table: string, opts?: { eq?: [string, string]; notNull?: string; isNull?: string }): Promise<number> {
  let q = sb.from(table).select("*", { count: "exact", head: true });
  if (opts?.eq) q = q.eq(opts.eq[0], opts.eq[1]);
  if (opts?.notNull) q = q.not(opts.notNull, "is", null);
  if (opts?.isNull) q = q.is(opts.isNull, null);
  const { count: c, error } = await q;
  if (error) {
    const label = `${table}${opts?.eq ? ` [${opts.eq[0]}=${opts.eq[1]}]` : ""}${opts?.notNull ? ` [${opts.notNull} IS NOT NULL]` : ""}${opts?.isNull ? ` [${opts.isNull} IS NULL]` : ""}`;
    throw new Error(`[${label}] ${JSON.stringify(error)}`);
  }
  return c ?? 0;
}

async function safeCount(label: string, fn: () => Promise<number>): Promise<number | null> {
  try {
    return await fn();
  } catch (e: unknown) {
    console.log(`  [${label}] 실패: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  v3 재설계 baseline 체크");
  console.log("═══════════════════════════════════════════════════\n");

  // ─── 1. 테이블별 전체 건수 ───
  console.log("【1. 테이블별 건수】");
  const wines = (await safeCount("wines", () => count("wines"))) ?? 0;
  const rawWines = (await safeCount("raw_wines", () => count("raw_wines"))) ?? 0;
  const wineRecords = (await safeCount("wine_records (살아있음)", () => count("wine_records", { isNull: "deleted_at" }))) ?? 0;
  const wineRecordsAll = (await safeCount("wine_records (전체)", () => count("wine_records"))) ?? 0;
  const pendingWines = (await safeCount("pending_wines", () => count("pending_wines"))) ?? 0;
  const recordEvaluations = (await safeCount("record_evaluations", () => count("record_evaluations"))) ?? 0;
  console.log(`  wines:              ${wines.toLocaleString()}`);
  console.log(`  raw_wines:          ${rawWines.toLocaleString()}`);
  console.log(`  wine_records:       ${wineRecords.toLocaleString()} (살아있음) / ${wineRecordsAll.toLocaleString()} (전체)`);
  console.log(`  pending_wines:      ${pendingWines.toLocaleString()}`);
  console.log(`  record_evaluations: ${recordEvaluations.toLocaleString()}`);

  // ─── 2. wines의 data_source 분포 (pagination으로 전량 집계) ───
  console.log("\n【2. wines 소스 분포】 (data_source 컬럼)");
  const dist: Record<string, number> = {};
  const pageSize = 1000;
  for (let offset = 0; offset < wines; offset += pageSize) {
    const { data, error } = await sb
      .from("wines")
      .select("data_source")
      .range(offset, offset + pageSize - 1);
    if (error) {
      console.log(`  페이지 ${offset} 실패: ${JSON.stringify(error)}`);
      break;
    }
    for (const r of data ?? []) {
      const k = r.data_source ?? "(null)";
      dist[k] = (dist[k] ?? 0) + 1;
    }
  }
  for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(20)} ${v.toLocaleString()}`);
  }

  // raw_wines source 분포도 확인
  console.log("\n【2-b. raw_wines 소스 분포】 (source 컬럼)");
  const rawDist: Record<string, number> = {};
  for (let offset = 0; offset < rawWines; offset += pageSize) {
    const { data, error } = await sb
      .from("raw_wines")
      .select("source")
      .range(offset, offset + pageSize - 1);
    if (error) {
      console.log(`  페이지 ${offset} 실패: ${JSON.stringify(error)}`);
      break;
    }
    for (const r of data ?? []) {
      const k = r.source ?? "(null)";
      rawDist[k] = (rawDist[k] ?? 0) + 1;
    }
  }
  for (const [k, v] of Object.entries(rawDist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(20)} ${v.toLocaleString()}`);
  }

  // ─── 3. 역이관 대상 (wines 중 raw_wines promoted_wine_id에 없는 행) ───
  console.log("\n【3. 역이관 대상】 (raw_wines에 대응 없는 wines 행)");
  const { data: promotedIds } = await sb
    .from("raw_wines")
    .select("promoted_wine_id")
    .not("promoted_wine_id", "is", null);
  const promotedSet = new Set((promotedIds ?? []).map((r) => r.promoted_wine_id));
  console.log(`  raw_wines 중 promoted_wine_id 보유: ${promotedSet.size.toLocaleString()}`);
  console.log(`  wines 전체:                          ${wines.toLocaleString()}`);
  const orphanCount = wines - promotedSet.size;
  console.log(`  → 역이관 대상(추정):                 ${orphanCount.toLocaleString()}`);
  console.log(`  (정확한 수치는 Phase 2 직전 SQL로 재계산 권장)`);

  // ─── 4. raw_wines enrichment 상태 ───
  console.log("\n【4. raw_wines enrichment (wine21 기준)】");
  const wine21Total = await count("raw_wines", { eq: ["source", "wine21"] });
  const wine21Vivino = await count("raw_wines", {
    eq: ["source", "wine21"],
    notNull: "raw_payload->>vivino_url",
  });
  const wine21LlmParsed = await count("raw_wines", {
    eq: ["source", "wine21"],
    notNull: "raw_payload->>llm_parsed_at",
  });
  const wine21WineryClean = await count("raw_wines", {
    eq: ["source", "wine21"],
    notNull: "raw_payload->>winery_en_clean",
  });
  console.log(`  wine21 전체:                ${wine21Total.toLocaleString()}`);
  console.log(`  ├ vivino_url 유효:          ${wine21Vivino.toLocaleString()} (${pct(wine21Vivino, wine21Total)})`);
  console.log(`  ├ LLM 파싱 완료:            ${wine21LlmParsed.toLocaleString()} (${pct(wine21LlmParsed, wine21Total)})`);
  console.log(`  └ winery_en_clean 보유:     ${wine21WineryClean.toLocaleString()} (${pct(wine21WineryClean, wine21Total)})`);

  // ─── 5. wines의 기존 enrichment (재설계 전) ───
  console.log("\n【5. wines 기존 enrichment】");
  const winesWithVivino = await count("wines", { notNull: "vivino_url" });
  const winesWithVivinoPage = await count("wines", { notNull: "vivino_page_url" });
  const winesPublished = (await safeCount("wines is_published=true", async () => {
    const { count: c, error } = await sb.from("wines").select("*", { count: "exact", head: true }).eq("is_published", true);
    if (error) throw new Error(JSON.stringify(error));
    return c ?? 0;
  })) ?? 0;
  console.log(`  vivino_url 보유:     ${winesWithVivino.toLocaleString()} (${pct(winesWithVivino, wines)})`);
  console.log(`  vivino_page_url 보유:${winesWithVivinoPage.toLocaleString()} (${pct(winesWithVivinoPage, wines)})`);
  console.log(`  is_published=true:   ${winesPublished.toLocaleString()} (${pct(winesPublished, wines)})`);

  // ─── 6. wine_records FK 상태 ───
  console.log("\n【6. wine_records FK 상태】 (살아있는 것 기준)");
  const wrWithWineId = await count("wine_records", {
    isNull: "deleted_at",
    notNull: "wine_id",
  });
  const wrWithPending = await count("wine_records", {
    isNull: "deleted_at",
    notNull: "pending_wine_id",
  });
  console.log(`  wine_id 연결:        ${wrWithWineId.toLocaleString()} (${pct(wrWithWineId, wineRecords)})`);
  console.log(`  pending_wine_id 연결:${wrWithPending.toLocaleString()} (${pct(wrWithPending, wineRecords)})`);
  const wrNoRef = wineRecords - wrWithWineId - wrWithPending;
  console.log(`  → 둘 다 없음(미매칭):${wrNoRef.toLocaleString()} (${pct(wrNoRef, wineRecords)})`);

  // ─── 7. 평가 이관 대상 ───
  console.log("\n【7. 평가 이관 대상】 (Phase 4에서 evaluations로 옮길 것)");
  const wrWithRating = await count("wine_records", {
    isNull: "deleted_at",
    notNull: "rating",
  });
  const wrWithMemo = await count("wine_records", {
    isNull: "deleted_at",
    notNull: "memo",
  });
  console.log(`  rating NOT NULL:     ${wrWithRating.toLocaleString()} → evaluations(role='owner')`);
  console.log(`  memo NOT NULL:       ${wrWithMemo.toLocaleString()}`);
  console.log(`  record_evaluations:  ${recordEvaluations.toLocaleString()} → evaluations(role='guest')`);

  // ─── 8. 위치 필드 상태 ───
  console.log("\n【8. 위치 필드 이관 대상】 (location → place_name)");
  const wrWithLocation = await count("wine_records", {
    isNull: "deleted_at",
    notNull: "location",
  });
  console.log(`  location NOT NULL:   ${wrWithLocation.toLocaleString()} → place_name으로 이관 필요`);

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  baseline 체크 완료. Phase 0 백업 범위 산정에 활용.");
  console.log("═══════════════════════════════════════════════════");

  // ─── 보너스: Phase 0용 SQL 스니펫 안내 ───
  console.log("\n📌 Phase 0 직전 Supabase SQL Editor에서 다음도 확인하세요:");
  console.log(`
  -- 확장 설치 상태
  SELECT extname, extversion FROM pg_extension
  WHERE extname IN ('pg_trgm', 'vector', 'pgvector');

  -- 더 정확한 역이관 대상 건수 (DB 측에서 조인)
  SELECT count(*) AS orphan_wines
  FROM wines w
  WHERE NOT EXISTS (
    SELECT 1 FROM raw_wines r WHERE r.promoted_wine_id = w.id
  );
`);
}

function pct(n: number, total: number): string {
  if (total === 0) return "0.0%";
  return `${((n / total) * 100).toFixed(1)}%`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
