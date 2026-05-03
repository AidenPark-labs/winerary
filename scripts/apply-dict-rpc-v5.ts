import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";
import { readFileSync } from "fs";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const sql = readFileSync(
      "supabase/migrations/20260503_dictionary_filter_options_v5.sql",
      "utf8",
    );
    await c.query(sql);
    console.log("적용 OK");
    const r = await c.query("SELECT dictionary_filter_options(NULL) AS opts");
    const opts = r.rows[0].opts;
    console.log("wine_types:", opts.wine_types?.length ?? 0);
    console.log("countries:", opts.countries?.length ?? 0);
    console.log("grapes:", opts.grapes?.length ?? 0);
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
