import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";
import { readFileSync } from "fs";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const sql = readFileSync(
      "supabase/migrations/20260502_wines_with_vivino_view.sql",
      "utf8",
    );
    await c.query(sql);
    console.log("view 적용 OK");
    const r = await c.query(`
      SELECT
        count(*)::int AS total,
        count(vivino_rating)::int AS has_rating,
        count(vivino_url)::int AS has_url
      FROM wines_with_vivino`);
    console.log(r.rows[0]);
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
