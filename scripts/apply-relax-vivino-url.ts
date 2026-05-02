// 20260502_relax_vivino_url_unique.sql 적용 + 검증
import { config } from "dotenv";
config({ path: ".env.local" });

import { Client } from "pg";
import { readFileSync } from "fs";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const sql = readFileSync("supabase/migrations/20260502_relax_vivino_url_unique.sql", "utf8");
    await c.query(sql);
    console.log(">> 적용 OK");

    const r1 = await c.query(`
      SELECT 1 FROM pg_constraint
      WHERE conname = 'vivino_wines_vivino_url_key'`);
    console.log("UNIQUE 제약 존재 (있으면 1):", r1.rowCount);

    const r2 = await c.query(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname='public' AND indexname='vivino_wines_vivino_url_idx'`);
    console.log("일반 인덱스:", r2.rows[0]?.indexname ?? "없음");

    const r3 = await c.query(`
      SELECT count(*)::int AS n FROM information_schema.views
      WHERE table_schema='public' AND table_name='vivino_url_duplicates'`);
    console.log("view 존재 (1=있음):", r3.rows[0].n);
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
