/**
 * wines_display view 의존성 + 정의 종합 조회.
 * supabase-js로 안 잡히는 시스템 카탈로그를 pg로 직접 쿼리.
 */
import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL이 .env.local에 없습니다.");
  process.exit(1);
}

const client = new Client({ connectionString: url });

async function main() {
  await client.connect();

  // 1) view 정의
  console.log("════════ 1. wines_display 정의 ════════");
  const def = await client.query(
    `SELECT pg_get_viewdef('public.wines_display'::regclass, true) AS definition`,
  );
  console.log(def.rows[0]?.definition ?? "(없음)");

  // 2) wines_display에 의존하는 다른 객체 (view, materialized view 등)
  console.log("\n════════ 2. wines_display를 참조하는 다른 객체 ════════");
  const deps = await client.query(`
    SELECT DISTINCT
      n.nspname AS schema,
      dependent.relname AS object_name,
      CASE dependent.relkind
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized_view'
        WHEN 'r' THEN 'table'
        WHEN 'f' THEN 'foreign_table'
        ELSE dependent.relkind::text
      END AS object_type
    FROM pg_depend d
    JOIN pg_rewrite r ON r.oid = d.objid
    JOIN pg_class dependent ON dependent.oid = r.ev_class
    JOIN pg_namespace n ON n.oid = dependent.relnamespace
    JOIN pg_class src ON src.oid = d.refobjid
    WHERE src.relname = 'wines_display'
      AND src.relkind = 'v'
      AND dependent.relname != 'wines_display'
  `);
  if (deps.rows.length === 0) console.log("(없음 — 안전하게 DROP/재정의 가능)");
  else for (const r of deps.rows) console.log(`  - ${r.schema}.${r.object_name} (${r.object_type})`);

  // 3) function/procedure 본문에 wines_display를 사용하는 것
  // pg_get_functiondef는 aggregate에 못 쓰니 prokind 필터 + prosrc/probin 직접 검사
  console.log("\n════════ 3. wines_display를 본문에서 사용하는 함수 ════════");
  const fns = await client.query(`
    SELECT n.nspname AS schema, p.proname AS function_name, l.lanname AS language, p.prokind
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE p.prokind IN ('f','p')  -- 일반 function / procedure만 (aggregate/window 제외)
      AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      AND COALESCE(p.prosrc, '') ILIKE '%wines_display%'
  `);
  if (fns.rows.length === 0) console.log("(없음)");
  else for (const r of fns.rows) console.log(`  - ${r.schema}.${r.function_name} (lang=${r.language})`);

  // 4) wines.vivino_page_url 컬럼에 직접 의존하는 객체 (drop 시 막히는 대상)
  console.log("\n════════ 4. wines.vivino_page_url 컬럼에 직접 의존하는 객체 ════════");
  const colDeps = await client.query(`
    SELECT DISTINCT
      n.nspname AS schema,
      dependent.relname AS object_name,
      CASE dependent.relkind
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized_view'
        WHEN 'r' THEN 'table'
        ELSE dependent.relkind::text
      END AS object_type
    FROM pg_depend d
    JOIN pg_rewrite r ON r.oid = d.objid
    JOIN pg_class dependent ON dependent.oid = r.ev_class
    JOIN pg_namespace n ON n.oid = dependent.relnamespace
    JOIN pg_class src ON src.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
    WHERE src.relname = 'wines'
      AND a.attname = 'vivino_page_url'
  `);
  if (colDeps.rows.length === 0) console.log("(없음)");
  else for (const r of colDeps.rows) console.log(`  - ${r.schema}.${r.object_name} (${r.object_type})`);

  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
