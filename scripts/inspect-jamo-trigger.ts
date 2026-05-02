import { config } from "dotenv";
config({ path: ".env.local" });

import { Client } from "pg";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    // wines 테이블 트리거 목록
    const trg = await c.query(`
      SELECT trigger_name, event_manipulation, action_timing, action_statement
      FROM information_schema.triggers
      WHERE event_object_schema='public' AND event_object_table='wines'
      ORDER BY trigger_name`);
    console.log("=== wines 트리거 ===");
    for (const r of trg.rows) {
      console.log(` ${r.trigger_name} ${r.action_timing} ${r.event_manipulation}`);
      console.log(`   ${r.action_statement}`);
    }

    // jamo 관련 함수
    const fns = await c.query(`
      SELECT proname, pg_get_functiondef(oid) AS def
      FROM pg_proc
      WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname='public')
        AND (proname ILIKE '%jamo%' OR proname ILIKE '%search%')
      ORDER BY proname`);
    console.log("\n=== jamo·search 관련 함수 ===");
    for (const r of fns.rows) {
      console.log(`\n--- ${r.proname} ---`);
      console.log(r.def);
    }
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
