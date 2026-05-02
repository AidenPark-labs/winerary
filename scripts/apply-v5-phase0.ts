// Phase 0: wines_v2 + vivino_wines 마이그레이션 적용
//
// 적용 후 검증:
//  - 두 테이블 컬럼 수
//  - 인덱스 존재
//  - 트리거 동작 (수동 INSERT 후 search_tsv 자동 채워짐)
//  - RLS 정책
//
// 사용법:
//   NODE_ENV=development npx tsx scripts/apply-v5-phase0.ts          # apply + verify
//   NODE_ENV=development npx tsx scripts/apply-v5-phase0.ts --verify # verify만

import { config } from "dotenv";
config({ path: ".env.local" });

import { Client } from "pg";
import { readFileSync } from "fs";
import { resolve } from "path";

const args = process.argv.slice(2);
const verifyOnly = args.includes("--verify");

const MIGRATIONS = [
  "supabase/migrations/20260429_create_wines_v2.sql",
  "supabase/migrations/20260429_create_vivino_wines.sql",
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing in .env.local");

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    if (!verifyOnly) {
      for (const path of MIGRATIONS) {
        const sql = readFileSync(resolve(path), "utf8");
        console.log(`>> applying ${path} (${sql.length} bytes)`);
        await client.query(sql);
        console.log(`   OK`);
      }
    } else {
      console.log(">> verify-only mode (skip apply)");
    }

    // 검증
    console.log("\n=== 테이블 존재 확인 ===");
    const { rows: tables } = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_name IN ('wines_v2','vivino_wines')
      ORDER BY table_name`);
    console.log(tables);

    console.log("\n=== wines_v2 컬럼 수 ===");
    const { rows: w2cols } = await client.query(`
      SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema='public' AND table_name='wines_v2'`);
    console.log("wines_v2 columns:", w2cols[0].n);

    const { rows: w2list } = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='wines_v2'
      ORDER BY ordinal_position`);
    for (const c of w2list) console.log(" ", c.column_name, c.data_type, c.is_nullable);

    console.log("\n=== vivino_wines 컬럼 수 ===");
    const { rows: vwcols } = await client.query(`
      SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema='public' AND table_name='vivino_wines'`);
    console.log("vivino_wines columns:", vwcols[0].n);

    console.log("\n=== 인덱스 ===");
    const { rows: idx } = await client.query(`
      SELECT tablename, indexname FROM pg_indexes
      WHERE schemaname='public' AND tablename IN ('wines_v2','vivino_wines')
      ORDER BY tablename, indexname`);
    for (const i of idx) console.log(" ", i.tablename, "→", i.indexname);

    console.log("\n=== 트리거 ===");
    const { rows: trg } = await client.query(`
      SELECT event_object_table AS tbl, trigger_name, action_timing, event_manipulation
      FROM information_schema.triggers
      WHERE event_object_schema='public'
        AND event_object_table IN ('wines_v2','vivino_wines')
      ORDER BY tbl, trigger_name`);
    for (const t of trg)
      console.log(" ", t.tbl, t.trigger_name, t.action_timing, t.event_manipulation);

    console.log("\n=== RLS 정책 ===");
    const { rows: pol } = await client.query(`
      SELECT tablename, policyname, cmd, roles
      FROM pg_policies
      WHERE schemaname='public' AND tablename IN ('wines_v2','vivino_wines')`);
    for (const p of pol) console.log(" ", p.tablename, p.policyname, p.cmd, p.roles);

    // 트리거 동작 확인 (search_tsv 자동 빌드)
    console.log("\n=== search_tsv 트리거 동작 시험 ===");
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO public.wines_v2
         (id, source, name_ko, name_en, wine_type, country_ko, region_ko, producer, grape_varieties, brand)
         VALUES
         (gen_random_uuid(), 'admin', '테스트 와인', 'Test Wine', 'red',
          '프랑스', '보르도', 'Chateau Test',
          ARRAY['까베르네 소비뇽','메를로'], 'TestBrand')`,
      );
      const { rows: probe } = await client.query(
        `SELECT name_ko, name_en, search_tsv::text AS tsv
         FROM public.wines_v2
         WHERE name_en='Test Wine'
         LIMIT 1`,
      );
      console.log("INSERT 후 search_tsv:", probe[0]?.tsv?.slice(0, 200));
      // 검증 끝났으니 롤백 (테스트 데이터 남기지 않음)
      await client.query("ROLLBACK");
      console.log("(테스트 INSERT는 ROLLBACK)");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }

    console.log("\nPhase 0 적용·검증 완료.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
