/**
 * 마이그레이션 SQL 파일을 트랜잭션으로 실행.
 *   npx tsx scripts/apply-migration.ts <migration-file-path>
 */
import { config } from "dotenv";
import { Client } from "pg";
import { readFileSync } from "node:fs";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL이 .env.local에 없습니다.");
  process.exit(1);
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: npx tsx scripts/apply-migration.ts <migration-file-path>");
  process.exit(1);
}

const sql = readFileSync(file, "utf-8");
console.log(`적용 대상: ${file}`);
console.log(`SQL 길이: ${sql.length} chars\n`);

const client = new Client({ connectionString: url });

async function verifyBefore() {
  const r1 = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wines'
      AND column_name IN ('vivino_url','vivino_page_url')
    ORDER BY column_name
  `);
  console.log("실행 전 wines 컬럼:", r1.rows.map((r) => r.column_name));

  const r2 = await client.query(`
    SELECT EXISTS(
      SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='wines_display'
    ) AS view_exists
  `);
  console.log("실행 전 wines_display 존재:", r2.rows[0].view_exists);
}

async function verifyAfter() {
  const r1 = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wines'
      AND column_name IN ('vivino_url','vivino_page_url')
    ORDER BY column_name
  `);
  console.log("실행 후 wines 컬럼:", r1.rows.map((r) => r.column_name));

  const r2 = await client.query(`
    SELECT viewname FROM pg_views WHERE schemaname='public' AND viewname='wines_display'
  `);
  console.log("실행 후 wines_display 존재:", r2.rows.length > 0);

  // view 컬럼 확인
  const r3 = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='wines_display'
      AND column_name LIKE 'vivino%'
    ORDER BY column_name
  `);
  console.log("실행 후 wines_display의 vivino_* 컬럼:", r3.rows.map((r) => r.column_name));

  // sanity: wines.vivino_url NOT NULL 카운트
  const r4 = await client.query(`SELECT count(*) AS c FROM wines WHERE vivino_url IS NOT NULL`);
  console.log("실행 후 wines.vivino_url NOT NULL:", r4.rows[0].c);
}

async function main() {
  await client.connect();
  try {
    console.log("════ 실행 전 상태 ════");
    await verifyBefore();

    console.log("\n════ 마이그레이션 실행 중… ════");
    await client.query(sql);
    console.log("실행 성공 ✅");

    console.log("\n════ 실행 후 상태 ════");
    await verifyAfter();
  } catch (e) {
    console.error("\n실행 실패:", e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
