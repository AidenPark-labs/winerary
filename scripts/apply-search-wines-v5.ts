import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";
import { readFileSync } from "fs";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const sql = readFileSync(
      "supabase/migrations/20260503_search_wines_v5.sql",
      "utf8",
    );
    await c.query(sql);
    console.log("RPC 적용 OK");

    // 시험
    const t1 = await c.query("SELECT id, name_ko, score FROM search_wines($1, NULL, NULL, NULL, NULL, NULL, NULL, $2)", ["메를로", 5]);
    console.log("\n검색 '메를로' top 5:");
    for (const r of t1.rows) console.log(`  ${r.name_ko} (score=${r.score})`);

    const t2 = await c.query("SELECT id, name_ko, score FROM search_wines($1, NULL, NULL, NULL, NULL, NULL, NULL, $2)", ["샤또", 5]);
    console.log("\n검색 '샤또' top 5:");
    for (const r of t2.rows) console.log(`  ${r.name_ko} (score=${r.score})`);
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
