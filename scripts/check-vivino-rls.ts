import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const r = await c.query(`
      SELECT tablename, policyname, cmd, roles, qual::text
      FROM pg_policies
      WHERE schemaname='public' AND tablename IN ('wines','vivino_wines')
      ORDER BY tablename, policyname`);
    for (const p of r.rows) {
      console.log(`${p.tablename} | ${p.policyname} | ${p.cmd} | roles=${p.roles} | qual=${p.qual}`);
    }
  } finally {
    await c.end();
  }
}
main().catch(console.error);
