// Phase 5 swap 적용 + 검증
import { config } from "dotenv";
config({ path: ".env.local" });

import { Client } from "pg";
import { readFileSync } from "fs";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    console.log(">> swap 마이그레이션 적용 중 (단일 트랜잭션)...");
    const sql = readFileSync("supabase/migrations/20260502_swap_wines_v2.sql", "utf8");
    await c.query(sql);
    console.log("✓ 적용 완료");

    // 검증
    console.log("\n=== 테이블 ===");
    const t = await c.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_name IN ('wines','wines_old','vivino_wines')
      ORDER BY table_name`);
    for (const r of t.rows) console.log(`  ${r.table_name}`);

    console.log("\n=== wines 컬럼 수 (신 wines = 구 wines_v2) ===");
    const cols = await c.query(`
      SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema='public' AND table_name='wines'`);
    console.log(`  ${cols.rows[0].n}개`);

    console.log("\n=== FK (wines 가리키는) ===");
    const fks = await c.query(`
      SELECT conname, conrelid::regclass AS source
      FROM pg_constraint
      WHERE contype='f' AND confrelid::regclass::text = 'wines'
      ORDER BY conname`);
    for (const r of fks.rows) console.log(`  ${r.conname} (from ${r.source})`);

    console.log("\n=== RLS 정책 ===");
    const pol = await c.query(`
      SELECT tablename, policyname, cmd FROM pg_policies
      WHERE schemaname='public' AND tablename IN ('wines','wines_old')
      ORDER BY tablename, policyname`);
    for (const r of pol.rows) console.log(`  ${r.tablename} | ${r.policyname} (${r.cmd})`);

    console.log("\n=== count 비교 ===");
    const w = await c.query("SELECT count(*)::int AS n FROM wines");
    const wo = await c.query("SELECT count(*)::int AS n FROM wines_old");
    console.log(`  wines (신): ${w.rows[0].n}`);
    console.log(`  wines_old (구): ${wo.rows[0].n}`);
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
