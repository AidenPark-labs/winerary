/**
 * vivino_page_url 기준 실측 조사 (READ-ONLY)
 *
 * 실행: NODE_ENV=development npx tsx scripts/check-vivino-page-url-coverage.ts
 *
 * 확인:
 *   1. raw_wines (wine21) 중 raw_payload.vivino_page_url 보유 건수
 *   2. raw_wines 중 vivino_url은 있지만 vivino_page_url 없음 (부정확 케이스)
 *   3. wines 테이블 중 vivino_page_url 보유 건수 (baseline에서 2,232)
 *   4. wine21 기준 충족 건수 재산출: name_ko+name_en+wine_type+country+vivino_page_url+vivino_grapes
 *   5. vivino_page_url 없는데 vivino_grapes 있는 건수 (untag된 FP의 잔재)
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  console.log("═══ vivino_page_url 기준 실측 ═══\n");

  // 1. raw_wines 현황
  console.log("[raw_wines (wine21 기준)]");

  const { count: wine21Total } = await sb
    .from("raw_wines")
    .select("*", { count: "exact", head: true })
    .eq("source", "wine21");

  const { count: hasUrl } = await sb
    .from("raw_wines")
    .select("*", { count: "exact", head: true })
    .eq("source", "wine21")
    .not("raw_payload->>vivino_url", "is", null);

  const { count: hasPageUrl } = await sb
    .from("raw_wines")
    .select("*", { count: "exact", head: true })
    .eq("source", "wine21")
    .not("raw_payload->>vivino_page_url", "is", null);

  const { count: hasGrapes } = await sb
    .from("raw_wines")
    .select("*", { count: "exact", head: true })
    .eq("source", "wine21")
    .not("raw_payload->>vivino_grapes", "is", null);

  // page_url은 있는데 grapes 없는 케이스
  const { count: pageUrlNoGrapes } = await sb
    .from("raw_wines")
    .select("*", { count: "exact", head: true })
    .eq("source", "wine21")
    .not("raw_payload->>vivino_page_url", "is", null)
    .is("raw_payload->>vivino_grapes", null);

  // page_url 없는데 grapes 있는 케이스 (FP 잔재로 의심)
  const { count: noPageUrlHasGrapes } = await sb
    .from("raw_wines")
    .select("*", { count: "exact", head: true })
    .eq("source", "wine21")
    .is("raw_payload->>vivino_page_url", null)
    .not("raw_payload->>vivino_grapes", "is", null);

  // url 있는데 page_url 없는 경우 (검색 URL만 있는 매칭)
  const { count: urlNoPageUrl } = await sb
    .from("raw_wines")
    .select("*", { count: "exact", head: true })
    .eq("source", "wine21")
    .not("raw_payload->>vivino_url", "is", null)
    .is("raw_payload->>vivino_page_url", null);

  console.log(`  전체:                  ${(wine21Total ?? 0).toLocaleString()}`);
  console.log(`  vivino_url 보유:       ${(hasUrl ?? 0).toLocaleString()}`);
  console.log(`  vivino_page_url 보유:  ${(hasPageUrl ?? 0).toLocaleString()}  ← 신뢰 가능 매칭`);
  console.log(`  vivino_grapes 보유:    ${(hasGrapes ?? 0).toLocaleString()}`);
  console.log();
  console.log(`  url은 있지만 page_url 없음 (검색 URL 매칭):  ${(urlNoPageUrl ?? 0).toLocaleString()}  ← 부정확, 폐기 대상`);
  console.log(`  page_url 없는데 grapes 있음 (FP 언태그 잔재):${(noPageUrlHasGrapes ?? 0).toLocaleString()}  ← 신뢰 불가, 정리 대상`);
  console.log(`  page_url 있는데 grapes 없음:                  ${(pageUrlNoGrapes ?? 0).toLocaleString()}`);

  // 2. wine21 기준 충족 재산출 (page_url 포함)
  console.log("\n[wine21 기준 충족 재산출]");
  const { count: allOk } = await sb
    .from("raw_wines")
    .select("*", { count: "exact", head: true })
    .eq("source", "wine21")
    .not("name_ko", "is", null)
    .not("name_en", "is", null)
    .not("wine_type", "is", null)
    .not("country", "is", null)
    .not("raw_payload->>vivino_page_url", "is", null)
    .not("raw_payload->>vivino_grapes", "is", null);
  console.log(`  name_ko + name_en + wine_type + country + vivino_page_url + vivino_grapes:`);
  console.log(`    → ${(allOk ?? 0).toLocaleString()} 건  (이전 예상 14,800에서 재조정)`);

  // 3. wines 테이블 (기존 데이터)
  console.log("\n[wines 테이블 (기존)]");
  const { count: winesTotal } = await sb.from("wines").select("*", { count: "exact", head: true });

  const { count: winesUrl } = await sb
    .from("wines")
    .select("*", { count: "exact", head: true })
    .not("vivino_url", "is", null);

  const { count: winesPageUrl } = await sb
    .from("wines")
    .select("*", { count: "exact", head: true })
    .not("vivino_page_url", "is", null);

  const { count: winesUrlNoPage } = await sb
    .from("wines")
    .select("*", { count: "exact", head: true })
    .not("vivino_url", "is", null)
    .is("vivino_page_url", null);

  console.log(`  전체:                  ${(winesTotal ?? 0).toLocaleString()}`);
  console.log(`  vivino_url 보유:       ${(winesUrl ?? 0).toLocaleString()}`);
  console.log(`  vivino_page_url 보유:  ${(winesPageUrl ?? 0).toLocaleString()}  ← 신뢰 가능`);
  console.log(`  url만 (page_url 없음): ${(winesUrlNoPage ?? 0).toLocaleString()}  ← 폐기 대상`);

  // 4. 처리 영향 요약
  console.log("\n═══ 정제 작업 영향 요약 ═══");
  const wine21UntagNeeded = (noPageUrlHasGrapes ?? 0);
  const wine21UrlCleanup = (urlNoPageUrl ?? 0) - wine21UntagNeeded; // grapes 없는 url만 있는 케이스
  console.log(`raw_wines (wine21):`);
  console.log(`  ⚠️ vivino_* 전부 null 처리 대상: ${wine21UntagNeeded.toLocaleString()}건 (page_url 없이 grapes 있음)`);
  console.log(`  ⚠️ vivino_url만 제거: ${Math.max(0, wine21UrlCleanup).toLocaleString()}건 (검색 URL만 있는 매칭)`);
  console.log(`wines 테이블:`);
  console.log(`  ⚠️ vivino_* 정리: ${(winesUrlNoPage ?? 0).toLocaleString()}건`);

  console.log("\n═══ 최종 wines 기대 건수 재산출 ═══");
  const wine21Final = allOk ?? 0;
  const naver = 2476;
  const winenara = 380;
  const user = 3;
  const gangnam = 1193; // 기존 예상 유지 (vivino 매칭 없음)
  const grandTotal = wine21Final + naver + winenara + user + gangnam;
  console.log(`  wine21 (vivino_page_url 기준):  ${wine21Final.toLocaleString()}`);
  console.log(`  naver_shopping:                  ${naver.toLocaleString()}`);
  console.log(`  winenara:                        ${winenara.toLocaleString()}`);
  console.log(`  user_submission:                 ${user.toLocaleString()}`);
  console.log(`  gangnam (promote):               ${gangnam.toLocaleString()}`);
  console.log(`  ────────────────────────────────`);
  console.log(`  예상 최종 wines:                 ${grandTotal.toLocaleString()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
