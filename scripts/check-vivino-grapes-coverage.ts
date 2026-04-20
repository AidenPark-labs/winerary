/**
 * raw_wines.raw_payload.vivino_grapes 실제 보유 건수 확인 (READ-ONLY)
 *
 * 실행: NODE_ENV=development npx tsx scripts/check-vivino-grapes-coverage.ts
 *
 * (B) 방침 적용 시: 기준 충족 wines가 얼마나 될지 추정.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PAGE = 1000;

async function main() {
  console.log("═══ vivino_grapes 보유 커버리지 (source별) ═══\n");

  for (const src of ["wine21", "gangnam"]) {
    const { count: total } = await sb
      .from("raw_wines")
      .select("*", { count: "exact", head: true })
      .eq("source", src);

    const { count: vivinoUrl } = await sb
      .from("raw_wines")
      .select("*", { count: "exact", head: true })
      .eq("source", src)
      .not("raw_payload->>vivino_url", "is", null);

    const { count: vivinoGrapes } = await sb
      .from("raw_wines")
      .select("*", { count: "exact", head: true })
      .eq("source", src)
      .not("raw_payload->>vivino_grapes", "is", null);

    console.log(`[${src}]`);
    console.log(`  전체:               ${(total ?? 0).toLocaleString()}`);
    console.log(`  vivino_url 있음:     ${(vivinoUrl ?? 0).toLocaleString()}`);
    console.log(`  vivino_grapes 있음:  ${(vivinoGrapes ?? 0).toLocaleString()}`);
    console.log(`    커버리지(전체 대비): ${(((vivinoGrapes ?? 0) / (total ?? 1)) * 100).toFixed(1)}%`);
    console.log(`    커버리지(vivino매칭 대비): ${(((vivinoGrapes ?? 0) / (vivinoUrl ?? 1)) * 100).toFixed(1)}%`);
    console.log();
  }

  // 기준 충족 기대치 시뮬레이션 (wine21 기준)
  console.log("═══ wine21 기준 충족 기대 건수 시뮬레이션 ═══");
  console.log("(B) 방침: grape_varieties는 vivino_grapes 우선, parsed_grape_varieties 폴백 금지");

  const { count: wine21Ok } = await sb
    .from("raw_wines")
    .select("*", { count: "exact", head: true })
    .eq("source", "wine21")
    .not("raw_payload->>vivino_url", "is", null)
    .not("raw_payload->>vivino_grapes", "is", null)
    .not("name_ko", "is", null)
    .not("name_en", "is", null)
    .not("wine_type", "is", null)
    .not("country", "is", null);
  console.log(`  wine21 중 name_ko+name_en+wine_type+country+vivino_grapes 모두 있음: ${(wine21Ok ?? 0).toLocaleString()}`);

  console.log("\n═══ legacy wines (naver/winenara/user_submission) 기준 재확인 ═══");
  for (const src of ["naver_shopping", "winenara", "user_submission"]) {
    const { count: ok } = await sb
      .from("wines")
      .select("*", { count: "exact", head: true })
      .eq("data_source", src)
      .not("name_ko", "is", null)
      .not("name_en", "is", null)
      .not("wine_type", "is", null)
      .not("country", "is", null)
      .not("grape_variety", "is", null);
    console.log(`  ${src}: ${(ok ?? 0).toLocaleString()} (기존 grape_variety 유효)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
