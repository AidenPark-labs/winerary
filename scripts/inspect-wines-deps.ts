// swap 전 wines 테이블에 의존하는 view·function 확인
import { config } from "dotenv";
config({ path: ".env.local" });

import { Client } from "pg";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    // wines를 참조하는 view
    const views = await c.query(`
      SELECT viewname, definition
      FROM pg_views
      WHERE schemaname='public' AND definition ILIKE '%wines%'`);
    console.log("=== wines 참조 view ===");
    for (const v of views.rows) {
      console.log(`\n--- ${v.viewname} ---`);
      console.log(v.definition.slice(0, 500));
    }

    // wine_records, pending_wines 등의 FK
    const fks = await c.query(`
      SELECT conname, conrelid::regclass AS source, confrelid::regclass AS target
      FROM pg_constraint
      WHERE contype='f' AND confrelid::regclass::text = 'wines'`);
    console.log("\n=== wines를 가리키는 FK ===");
    for (const r of fks.rows) console.log(` ${r.source}.${r.conname} → ${r.target}`);

    // wines RLS 정책
    const policies = await c.query(`
      SELECT tablename, policyname, cmd, qual::text, with_check::text
      FROM pg_policies
      WHERE schemaname='public' AND tablename IN ('wines','wines_v2')`);
    console.log("\n=== RLS 정책 ===");
    for (const p of policies.rows) console.log(`  ${p.tablename} | ${p.policyname} | ${p.cmd} | qual=${p.qual}`);
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
