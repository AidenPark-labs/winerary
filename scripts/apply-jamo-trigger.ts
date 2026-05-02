import { config } from "dotenv";
config({ path: ".env.local" });

import { Client } from "pg";
import { readFileSync } from "fs";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const sql = readFileSync("supabase/migrations/20260502_wines_v2_search_jamo.sql", "utf8");
    console.log(">> 적용 중 (jamo backfill 포함, 수 초 소요)...");
    await c.query(sql);
    console.log("OK");

    const r = await c.query(`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE search_jamo IS NOT NULL)::int AS filled,
        count(*) FILTER (WHERE search_jamo IS NULL)::int AS empty
      FROM wines_v2`);
    console.log("\n검증:", r.rows[0]);

    const sample = await c.query(`
      SELECT name_ko, search_jamo
      FROM wines_v2 WHERE search_jamo IS NOT NULL LIMIT 3`);
    console.log("샘플:");
    for (const s of sample.rows) {
      console.log(`  ${s.name_ko} → ${(s.search_jamo as string).slice(0, 80)}`);
    }
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
