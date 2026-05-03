import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    // 최근 30분 안에 가격이 갱신된 wines 있는지
    const r1 = await c.query(`
      SELECT count(*)::int AS n FROM wines
      WHERE updated_at > now() - interval '30 minutes'`);
    console.log("최근 30분 updated_at 갱신:", r1.rows[0].n);

    // price 컬럼 채워진 비율
    const r2 = await c.query(`
      SELECT
        count(*)::int AS total,
        count(price)::int AS has_price
      FROM wines`);
    console.log("price 채워진 wines:", r2.rows[0].has_price, "/", r2.rows[0].total);

    // 가장 최근 갱신된 5건
    const r3 = await c.query(`
      SELECT name_ko, price, updated_at
      FROM wines
      ORDER BY updated_at DESC
      LIMIT 5`);
    console.log("\n최근 updated_at top 5:");
    for (const r of r3.rows) {
      console.log(`  ${r.name_ko} | price=${r.price} | ${r.updated_at}`);
    }
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
