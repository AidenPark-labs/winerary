// Quick snapshot for v5 schema cleanup planning
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { count: wineCount } = await sb
    .from("wines")
    .select("id", { count: "exact", head: true });

  const { count: rawCount } = await sb
    .from("raw_wines")
    .select("id", { count: "exact", head: true });

  const { count: vivinoUrlCount } = await sb
    .from("wines")
    .select("id", { count: "exact", head: true })
    .not("vivino_url", "is", null);

  const { count: alcoholCount } = await sb
    .from("wines")
    .select("id", { count: "exact", head: true })
    .not("alcohol", "is", null);

  const { count: vivinoAlcoholCount } = await sb
    .from("wines")
    .select("id", { count: "exact", head: true })
    .not("vivino_alcohol", "is", null);

  // Check whether vivino_wines table exists
  const { error: vinoTblErr } = await sb
    .from("vivino_wines")
    .select("id", { head: true, count: "exact" })
    .limit(1);

  // Sample one wines row to see all columns
  const { data: sampleRow } = await sb.from("wines").select("*").limit(1);
  const colNames = sampleRow?.[0] ? Object.keys(sampleRow[0]) : [];

  // Backup table check
  const { error: backupErr } = await sb
    .from("wines_backup_pre_v5")
    .select("id", { head: true, count: "exact" })
    .limit(1);

  console.log("=== wines 현황 ===");
  console.log("총 와인:", wineCount);
  console.log("raw_wines:", rawCount);
  console.log("vivino_url 있는 wines:", vivinoUrlCount);
  console.log("alcohol(정규) 있는 wines:", alcoholCount);
  console.log("vivino_alcohol 있는 wines:", vivinoAlcoholCount);
  console.log();
  console.log("=== 스키마 진행 상태 ===");
  console.log("wines 컬럼 수:", colNames.length);
  console.log("vivino_wines 테이블:", vinoTblErr ? `없음 (${vinoTblErr.code})` : "있음");
  console.log("wines_backup_pre_v5:", backupErr ? `없음 (${backupErr.code})` : "있음");
  console.log();
  console.log("=== vivino_* 잔존 컬럼 (wines) ===");
  console.log(colNames.filter((c) => c.startsWith("vivino_")).join(", "));
  console.log();
  console.log("=== final_* 잔존 컬럼 (wines) ===");
  console.log(colNames.filter((c) => c.startsWith("final_")).join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
