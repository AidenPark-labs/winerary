import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  // 1. 두 컬럼 NULL/NOT NULL 매트릭스
  const { count: cTotalWines } = await sb
    .from("wines")
    .select("id", { count: "exact", head: true });
  const { count: cUrlNotNull } = await sb
    .from("wines")
    .select("id", { count: "exact", head: true })
    .not("vivino_url", "is", null);
  const { count: cPageNotNull } = await sb
    .from("wines")
    .select("id", { count: "exact", head: true })
    .not("vivino_page_url", "is", null);
  const { count: cBothNotNull } = await sb
    .from("wines")
    .select("id", { count: "exact", head: true })
    .not("vivino_url", "is", null)
    .not("vivino_page_url", "is", null);
  const { count: cUrlOnly } = await sb
    .from("wines")
    .select("id", { count: "exact", head: true })
    .not("vivino_url", "is", null)
    .is("vivino_page_url", null);
  const { count: cPageOnly } = await sb
    .from("wines")
    .select("id", { count: "exact", head: true })
    .is("vivino_url", null)
    .not("vivino_page_url", "is", null);

  console.log("=== 두 컬럼 NULL 매트릭스 ===");
  console.log("wines 총:", cTotalWines);
  console.log("vivino_url NOT NULL:", cUrlNotNull);
  console.log("vivino_page_url NOT NULL:", cPageNotNull);
  console.log("둘 다 NOT NULL:", cBothNotNull);
  console.log("vivino_url만 (page_url NULL):", cUrlOnly);
  console.log("vivino_page_url만 (url NULL):", cPageOnly);

  // 2. search 패턴이 어느 컬럼에 들어 있는지
  const { count: cSearchInUrl } = await sb
    .from("wines")
    .select("id", { count: "exact", head: true })
    .like("vivino_url", "%/search/%");
  const { count: cSearchInPage } = await sb
    .from("wines")
    .select("id", { count: "exact", head: true })
    .like("vivino_page_url", "%/search/%");
  const { count: cSearchInBoth } = await sb
    .from("wines")
    .select("id", { count: "exact", head: true })
    .like("vivino_url", "%/search/%")
    .like("vivino_page_url", "%/search/%");

  console.log("\n=== search 패턴 분포 ===");
  console.log("vivino_url에 /search/:", cSearchInUrl);
  console.log("vivino_page_url에 /search/:", cSearchInPage);
  console.log("둘 다 /search/:", cSearchInBoth);

  // 3. 두 컬럼이 같은 값인 비율 (NOT NULL인 것들 중)
  const { data: bothRows } = await sb
    .from("wines")
    .select("vivino_url, vivino_page_url")
    .not("vivino_url", "is", null)
    .not("vivino_page_url", "is", null)
    .limit(2000);

  let same = 0, diffr = 0;
  const diffSamples: { url: string; page: string }[] = [];
  for (const r of bothRows ?? []) {
    if (r.vivino_url === r.vivino_page_url) same++;
    else {
      diffr++;
      if (diffSamples.length < 8) diffSamples.push({ url: r.vivino_url, page: r.vivino_page_url });
    }
  }
  console.log(`\n=== 둘 다 NOT NULL인 ${(bothRows ?? []).length}건 중 ===`);
  console.log("같은 값:", same, " 다른 값:", diffr);
  if (diffSamples.length > 0) {
    console.log("\n다른 값 샘플:");
    for (const s of diffSamples) console.log("  url :", s.url, "\n  page:", s.page, "\n");
  }

  // 4. 어드민 ReviewClient 우선순위 (page_url ?? url) 시뮬: 어드민에 보이는 링크가 search인 건 몇 건?
  // page_url이 NOT NULL이면 page_url 사용, 아니면 url
  // SQL로 정확히 표현하기 어려우니 분리해서 더한다.
  const { count: cAdminLinksA } = await sb
    .from("wines")
    .select("id", { count: "exact", head: true })
    .not("vivino_page_url", "is", null)
    .like("vivino_page_url", "%/search/%");
  const { count: cAdminLinksB } = await sb
    .from("wines")
    .select("id", { count: "exact", head: true })
    .is("vivino_page_url", null)
    .not("vivino_url", "is", null)
    .like("vivino_url", "%/search/%");
  console.log("\n=== 어드민 검수에서 실제 클릭되는 링크가 /search/인 건 ===");
  console.log("(page_url NOT NULL & search):", cAdminLinksA);
  console.log("(page_url NULL & url search):", cAdminLinksB);
  console.log("합계:", (cAdminLinksA ?? 0) + (cAdminLinksB ?? 0));
}

main().catch((e) => { console.error(e); process.exit(1); });
