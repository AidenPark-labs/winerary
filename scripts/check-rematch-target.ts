import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { count: total } = await sb.from("raw_wines").select("*", { count: "exact", head: true }).eq("source", "wine21");
  const { count: alreadyMatched } = await sb.from("raw_wines").select("*", { count: "exact", head: true }).eq("source", "wine21").not("raw_payload->>vivino_url", "is", null);
  const { count: parsed } = await sb.from("raw_wines").select("*", { count: "exact", head: true }).eq("source", "wine21").not("raw_payload->>llm_parsed_at", "is", null);
  const { count: targetAll } = await sb.from("raw_wines").select("*", { count: "exact", head: true })
    .eq("source", "wine21")
    .is("raw_payload->>vivino_url", null)
    .not("raw_payload->>llm_parsed_at", "is", null)
    .not("raw_payload->>parsed_search_query", "is", null)
    .neq("raw_payload->>parsed_search_query", "");
  console.log("wine21 전체:", total);
  console.log("  기존 vivino 매칭 성공:", alreadyMatched);
  console.log("  LLM 파싱 완료:", parsed);
  console.log("  [재매칭 대상] 미매칭 + 파싱 있음 + query 비어있지 않음:", targetAll);

  // 샘플 미리보기
  const { data: sample } = await sb.from("raw_wines")
    .select("id, name_en, raw_payload")
    .eq("source", "wine21")
    .is("raw_payload->>vivino_url", null)
    .not("raw_payload->>parsed_search_query", "is", null)
    .neq("raw_payload->>parsed_search_query", "")
    .limit(5);
  console.log("\n샘플 5건 (name_en → parsed_search_query):");
  for (const r of sample ?? []) {
    const p = r.raw_payload as Record<string, unknown>;
    console.log(`  "${r.name_en?.slice(0,60)}" → "${p.parsed_search_query}"`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
