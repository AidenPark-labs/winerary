import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const r = await c.query(`
      SELECT pg_get_functiondef(oid) AS def
      FROM pg_proc
      WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname='public')
        AND proname = 'search_wines'`);
    if (r.rows.length === 0) { console.log("함수 없음"); return; }
    console.log(r.rows[0].def);

    // 시험 호출
    console.log("\n=== 시험 호출 ===");
    try {
      const test = await c.query("SELECT id, name_ko, score FROM search_wines($1, $2) LIMIT 3", ["메를로", 10]);
      console.log("결과:", test.rows);
    } catch (e: any) {
      console.log("RPC 에러:", e.message);
    }
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
