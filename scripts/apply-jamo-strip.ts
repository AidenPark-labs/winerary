import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";
import { readFileSync } from "fs";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const sql = readFileSync(
      "supabase/migrations/20260503_search_jamo_strip_space.sql",
      "utf8",
    );
    console.log(">> 트리거 갱신 + 전수 backfill...");
    await c.query(sql);
    console.log("OK");

    // 검증
    const r1 = await c.query(
      "SELECT name_ko, search_jamo FROM wines WHERE name_ko ILIKE '%무초 마스%' LIMIT 3",
    );
    console.log("\n샘플 (무초 마스):");
    for (const r of r1.rows) console.log(`  ${r.name_ko} → ${r.search_jamo}`);

    const r2 = await c.query(
      "SELECT id, name_ko, score FROM search_wines($1, NULL, NULL, NULL, NULL, NULL, NULL, $2)",
      ["무초마스", 5],
    );
    console.log(`\n검색 '무초마스': ${r2.rowCount}건`);
    for (const r of r2.rows) console.log(`  ${r.name_ko} (${r.score})`);
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
