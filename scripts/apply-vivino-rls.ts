import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";
import { readFileSync } from "fs";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const sql = readFileSync(
      "supabase/migrations/20260502_vivino_wines_public_read.sql",
      "utf8",
    );
    await c.query(sql);
    console.log("적용 OK");

    const r = await c.query(`
      SELECT policyname, cmd, qual::text
      FROM pg_policies
      WHERE schemaname='public' AND tablename='vivino_wines'`);
    for (const p of r.rows) console.log(`  ${p.policyname} | ${p.cmd} | ${p.qual}`);

    const c2 = await c.query("SELECT count(*)::int AS n FROM vivino_wines WHERE reviewed_at IS NOT NULL");
    console.log("reviewed_at NOT NULL:", c2.rows[0].n);
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
