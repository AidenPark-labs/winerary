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
        AND proname = 'dictionary_filter_options'`);
    console.log(r.rows[0]?.def ?? "not found");
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
