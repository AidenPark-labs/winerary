import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const r = await c.query(`
      SELECT
        c.conname,
        c.conrelid::regclass AS source_table,
        a.attname AS source_col,
        c.confdeltype,
        c.confupdtype
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
      WHERE c.contype='f' AND c.confrelid::regclass::text = 'wines'
      ORDER BY source_table, conname`);
    for (const row of r.rows) {
      console.log(`${row.source_table}.${row.source_col} (${row.conname}) on_delete=${row.confdeltype} on_update=${row.confupdtype}`);
    }
  } finally {
    await c.end();
  }
}
main().catch(console.error);
