import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data } = await sb.from("wines").select("*").limit(1);
  const cols = data?.[0] ? Object.keys(data[0]).sort() : [];
  console.log("총 컬럼:", cols.length);
  for (const c of cols) console.log(c);

  console.log("\n=== vivino_wines 테이블 컬럼 ===");
  const { data: vw } = await sb.from("vivino_wines").select("*").limit(1);
  if (vw?.[0]) {
    for (const c of Object.keys(vw[0]).sort()) console.log(c);
  } else {
    console.log("(빈 테이블 - 컬럼 확인 위해 head 쿼리)");
    const { error } = await sb.from("vivino_wines").select("id").limit(0);
    console.log("error:", error);
  }
  const { count: vwCount } = await sb
    .from("vivino_wines")
    .select("id", { count: "exact", head: true });
  console.log("vivino_wines 레코드:", vwCount);

  console.log("\n=== wines_backup_pre_v5 ===");
  const { count: bkCount } = await sb
    .from("wines_backup_pre_v5")
    .select("id", { count: "exact", head: true });
  console.log("backup 레코드:", bkCount);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
