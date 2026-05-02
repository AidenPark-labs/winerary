// region 관련 컬럼들의 실제 path 형식 샘플 확인
// finest가 앞에 오는지 뒤에 오는지 판정
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  // 1) wines.region (path가 있는 것)
  const { data: wRegion } = await sb
    .from("wines")
    .select("country_ko, region, region_path")
    .or("region.ilike.%/%,region.ilike.%>%,region.ilike.%,%")
    .not("region", "is", null)
    .limit(15);

  console.log("=== wines.region (구분자 포함) ===");
  for (const r of wRegion ?? []) {
    console.log(` country_ko=${r.country_ko} | region="${r.region}" | region_path="${r.region_path}"`);
  }

  // 2) wines.region_path (그 자체로 path)
  const { data: wPath } = await sb
    .from("wines")
    .select("country_ko, region_path")
    .not("region_path", "is", null)
    .limit(15);

  console.log("\n=== wines.region_path 샘플 ===");
  for (const r of wPath ?? []) {
    console.log(` country_ko=${r.country_ko} | "${r.region_path}"`);
  }

  // 3) raw_payload.vivino_region (Vivino 원본)
  const { data: rwVivino } = await sb
    .from("raw_wines")
    .select("name_en, raw_payload")
    .eq("source", "wine21")
    .not("raw_payload->vivino_region", "is", null)
    .limit(15);

  console.log("\n=== raw_payload.vivino_region 샘플 (Vivino 원본 형식) ===");
  for (const r of rwVivino ?? []) {
    console.log(` "${(r.raw_payload as any).vivino_region}" | name=${r.name_en}`);
  }

  // 4) wines.vivino_region 직접 컬럼
  const { data: wVivino } = await sb
    .from("wines")
    .select("name_en, country_ko, vivino_region")
    .not("vivino_region", "is", null)
    .limit(15);

  console.log("\n=== wines.vivino_region 직접 컬럼 ===");
  for (const r of wVivino ?? []) {
    console.log(` country_ko=${r.country_ko} | "${r.vivino_region}" | name=${r.name_en}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
