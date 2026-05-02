// wines의 search_tsv 트리거, embedding 차원, 인덱스 등 실제 내부 구조 확인
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  // information_schema는 supabase-js로 읽기 까다로우니 RPC pg_meta 활용 시도. 대신 직접 sample.
  const { data: sample } = await sb.from("wines").select("*").limit(1);
  if (sample?.[0]) {
    const row = sample[0] as any;
    console.log("=== embedding 샘플 ===");
    console.log("type:", typeof row.embedding);
    if (typeof row.embedding === "string") {
      const arr = row.embedding.replace(/^\[|\]$/g, "").split(",");
      console.log("dim (parsed):", arr.length);
    } else if (Array.isArray(row.embedding)) {
      console.log("dim:", row.embedding.length);
    } else {
      console.log("value:", row.embedding);
    }

    console.log("\n=== search_tsv ===");
    console.log("value type:", typeof row.search_tsv);
    console.log("value:", row.search_tsv?.toString().slice(0, 200));

    console.log("\n=== search_jamo ===");
    console.log("value type:", typeof row.search_jamo);
    console.log("value:", row.search_jamo?.toString().slice(0, 200));

    console.log("\n=== source_snapshot 구조 (샘플 5건) ===");
    const { data: snaps } = await sb
      .from("wines")
      .select("id, source, source_snapshot")
      .not("source_snapshot", "is", null)
      .limit(5);
    for (const s of snaps ?? []) {
      console.log(`source=${s.source}`);
      console.log(JSON.stringify(s.source_snapshot, null, 2).slice(0, 500));
      console.log("---");
    }
  }

  console.log("\n=== source_snapshot 채워진 비율 ===");
  const { count: total } = await sb
    .from("wines")
    .select("id", { count: "exact", head: true });
  const { count: withSnap } = await sb
    .from("wines")
    .select("id", { count: "exact", head: true })
    .not("source_snapshot", "is", null);
  console.log(`source_snapshot NOT NULL: ${withSnap} / ${total}`);

  console.log("\n=== embedding 채워진 비율 ===");
  const { count: withEmb } = await sb
    .from("wines")
    .select("id", { count: "exact", head: true })
    .not("embedding", "is", null);
  console.log(`embedding NOT NULL: ${withEmb} / ${total}`);

  console.log("\n=== search_jamo 채워진 비율 ===");
  const { count: withJamo } = await sb
    .from("wines")
    .select("id", { count: "exact", head: true })
    .not("search_jamo", "is", null);
  console.log(`search_jamo NOT NULL: ${withJamo} / ${total}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
