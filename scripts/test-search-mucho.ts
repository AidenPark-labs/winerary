import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    // 1) "무초마스" 직접 검색 RPC
    console.log("=== search_wines RPC ('무초마스') ===");
    const r1 = await c.query(
      "SELECT id, name_ko, score FROM search_wines($1, NULL, NULL, NULL, NULL, NULL, NULL, $2)",
      ["무초마스", 10],
    );
    console.log(`결과 ${r1.rowCount}건`);
    for (const r of r1.rows) console.log(`  ${r.name_ko} (${r.score})`);

    // 2) name_ko에 "무초마스" 포함된 wines 직접 조회
    console.log("\n=== wines.name_ko ILIKE '%무초마스%' ===");
    const r2 = await c.query(
      "SELECT id, name_ko, name_en FROM wines WHERE name_ko ILIKE $1 OR name_en ILIKE $1 LIMIT 10",
      ["%무초마스%"],
    );
    console.log(`결과 ${r2.rowCount}건`);
    for (const r of r2.rows) console.log(`  ${r.name_ko} | ${r.name_en}`);

    // 3) 띄어쓰기 fuzzy: "무%초%마%스"
    console.log("\n=== wines.name_ko ILIKE '%무%초%마%스%' ===");
    const r3 = await c.query(
      "SELECT id, name_ko, name_en FROM wines WHERE name_ko ILIKE $1 LIMIT 10",
      ["%무%초%마%스%"],
    );
    console.log(`결과 ${r3.rowCount}건`);
    for (const r of r3.rows) console.log(`  ${r.name_ko} | ${r.name_en}`);

    // 4) is_published 체크
    console.log("\n=== is_published 분포 ===");
    const r4 = await c.query("SELECT is_published, count(*)::int FROM wines GROUP BY is_published");
    for (const r of r4.rows) console.log(`  ${r.is_published}: ${r.count}`);

    // 5) name_en에 mucho 또는 muchomas 같은 영문 검색
    console.log("\n=== wines.name_en ILIKE '%mucho%' ===");
    const r5 = await c.query(
      "SELECT id, name_ko, name_en FROM wines WHERE name_en ILIKE $1 LIMIT 10",
      ["%mucho%"],
    );
    console.log(`결과 ${r5.rowCount}건`);
    for (const r of r5.rows) console.log(`  ${r.name_ko} | ${r.name_en}`);
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
