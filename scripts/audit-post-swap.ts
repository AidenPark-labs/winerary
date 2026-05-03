// swap 후 깨진 의존성 전수 검사
import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";

const NEW_WINES_COLUMNS = new Set([
  "id","source","source_refs","source_snapshot","created_at","updated_at",
  "name_ko","name_en","wine_type","wine_style",
  "country_ko","region_ko",
  "producer",
  "grape_varieties","grape_blend","alcohol","brand","price",
  "description","image_url","is_published",
  "search_tsv","search_jamo","embedding","embedded_at","search_query_en",
  "locked_fields","needs_review","needs_review_reasons",
]);

const OLD_ONLY_COLUMNS = [
  "country","region","region_path",
  "producer_ko","producer_en","winery_en_clean",
  "wine_style_ko","grape_varieties_ko","grape_variety",
  "vivino_url","vivino_rating","vivino_reviews","vivino_wine_id",
  "vivino_winery","vivino_grapes","vivino_region","vivino_style",
  "vivino_alcohol","vivino_description","vivino_allergens","vivino_name",
  "vivino_needs_review","vivino_reviewed_at",
  "naver_link","naver_image","review_image_url","gangnam_alcohol",
  "data_source",
  "final_grapes","final_region","final_country","final_producer",
  "final_wine_type","final_alcohol","final_style","final_description",
];

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    console.log("=== 1. RPC 함수 ===");
    const fns = await c.query(`
      SELECT proname, pg_get_functiondef(oid) AS def
      FROM pg_proc
      WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname='public')
        AND prokind = 'f'`);
    let brokenFns = 0;
    for (const f of fns.rows) {
      const def: string = f.def;
      // wines를 참조하면서 구 컬럼 사용하는지
      if (!/\bwines\b/.test(def)) continue;
      const issues: string[] = [];
      for (const col of OLD_ONLY_COLUMNS) {
        // w.col, wines.col 패턴
        const re = new RegExp(`\\b(w|wines)\\.${col}\\b`, "g");
        if (re.test(def)) issues.push(col);
      }
      if (issues.length > 0) {
        console.log(`  ⚠ ${f.proname}: 구 컬럼 ${issues.length}개 참조 (${issues.slice(0, 5).join(", ")}${issues.length > 5 ? "..." : ""})`);
        brokenFns++;
      }
    }
    if (brokenFns === 0) console.log("  ✓ wines 구 컬럼 참조하는 RPC 없음");

    console.log("\n=== 2. View ===");
    const views = await c.query(`
      SELECT viewname, definition
      FROM pg_views
      WHERE schemaname='public'`);
    for (const v of views.rows) {
      const def: string = v.definition;
      if (!/\bwines\b/.test(def)) continue;
      const issues: string[] = [];
      for (const col of OLD_ONLY_COLUMNS) {
        const re = new RegExp(`\\b${col}\\b`, "g");
        if (re.test(def)) issues.push(col);
      }
      if (issues.length > 0) {
        console.log(`  ⚠ ${v.viewname}: 구 컬럼 ${issues.length}개 (${issues.slice(0, 5).join(", ")})`);
      } else {
        console.log(`  ✓ ${v.viewname}`);
      }
    }

    console.log("\n=== 3. 트리거 함수 ===");
    const trgFns = await c.query(`
      SELECT DISTINCT p.proname, pg_get_functiondef(p.oid) AS def
      FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
      JOIN pg_class c ON c.oid = t.tgrelid
      WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname='public')
        AND NOT t.tgisinternal`);
    for (const f of trgFns.rows) {
      const def: string = f.def;
      if (!/\bNEW\./.test(def)) continue;
      const issues: string[] = [];
      for (const col of OLD_ONLY_COLUMNS) {
        const re = new RegExp(`\\bNEW\\.${col}\\b`, "g");
        if (re.test(def)) issues.push(col);
      }
      if (issues.length > 0) {
        console.log(`  ⚠ ${f.proname}: 구 컬럼 (${issues.join(", ")})`);
      }
    }

    console.log("\n=== 4. RPC 시험 호출 (search_wines·top_wines_by_events·dictionary_filter_options) ===");
    const tests: Array<[string, string, any[]]> = [
      ["search_wines", "SELECT * FROM search_wines($1, NULL, NULL, NULL, NULL, NULL, NULL, $2)", ["메를로", 1]],
      ["top_wines_by_events", "SELECT * FROM top_wines_by_events($1, $2)", [30, 5]],
      ["dictionary_filter_options", "SELECT dictionary_filter_options($1)", [null]],
    ];
    for (const [name, sql, args] of tests) {
      try {
        await c.query(sql, args);
        console.log(`  ✓ ${name}`);
      } catch (e: any) {
        console.log(`  ⚠ ${name}: ${e.message}`);
      }
    }
  } finally {
    await c.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
