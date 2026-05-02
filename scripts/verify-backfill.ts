import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { count: w2 } = await sb.from("wines_v2").select("id", { count: "exact", head: true });
  const { count: vw } = await sb.from("vivino_wines").select("wine_id", { count: "exact", head: true });
  const { count: w } = await sb.from("wines").select("id", { count: "exact", head: true });
  const { count: needsReview } = await sb
    .from("wines_v2")
    .select("id", { count: "exact", head: true })
    .eq("needs_review", true);
  const { count: vivinoNeedsReview } = await sb
    .from("vivino_wines")
    .select("wine_id", { count: "exact", head: true })
    .eq("needs_review", true);
  const { count: vivinoReviewed } = await sb
    .from("vivino_wines")
    .select("wine_id", { count: "exact", head: true })
    .not("reviewed_at", "is", null);

  console.log(`wines (origin):   ${w}`);
  console.log(`wines_v2:         ${w2}`);
  console.log(`vivino_wines:     ${vw}`);
  console.log(`needs_review (wines_v2):     ${needsReview}`);
  console.log(`needs_review (vivino_wines): ${vivinoNeedsReview}`);
  console.log(`vivino reviewed_at NOT NULL: ${vivinoReviewed}`);

  // vivino_url_duplicates view 동작 확인
  const { data: dup } = await sb.from("vivino_url_duplicates").select("vivino_url, dup_count").limit(5);
  console.log(`\nvivino_url 중복 그룹 샘플:`);
  for (const r of dup ?? []) console.log(`  ${r.dup_count}× — ${r.vivino_url}`);

  // search_tsv 트리거 동작 확인
  const { data: sample } = await sb
    .from("wines_v2")
    .select("name_ko, search_tsv")
    .limit(1);
  console.log(`\nsearch_tsv 샘플: ${(sample?.[0]?.search_tsv as string)?.slice(0, 150)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
