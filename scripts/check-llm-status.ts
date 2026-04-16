import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // 1. 모든 source에서 llm_parsed_at / parsed_* 필드 존재 여부
  const checks: Array<[string, string, unknown]> = [
    ["llm_parsed_at not null (all sources)", "raw_payload->>llm_parsed_at", "is.not.null"],
    ["parsed_search_query not null (all)", "raw_payload->>parsed_search_query", "is.not.null"],
    ["parsed_brand not null (all)", "raw_payload->>parsed_brand", "is.not.null"],
    ["parsed_search_query not empty", "raw_payload->>parsed_search_query", "neq."],
  ];

  for (const [label, field] of checks) {
    const q = sb.from("raw_wines").select("*", { count: "exact", head: true });
    if (label.startsWith("parsed_search_query not empty")) {
      q.neq(field, "");
    } else {
      q.not(field, "is", null);
    }
    const { count, error } = await q;
    console.log(`${label}: ${count ?? "?"} ${error ? `(err: ${error.message})` : ""}`);
  }

  // 2. source별 분포
  const sources = ["wine21", "winenara", "gangnam", "vivino"];
  console.log("\n[source별 llm_parsed_at 분포]");
  for (const src of sources) {
    const { count } = await sb
      .from("raw_wines")
      .select("*", { count: "exact", head: true })
      .eq("source", src)
      .not("raw_payload->>llm_parsed_at", "is", null);
    const { count: total } = await sb
      .from("raw_wines")
      .select("*", { count: "exact", head: true })
      .eq("source", src);
    console.log(`  ${src}: ${count ?? 0} / ${total ?? 0}`);
  }

  // 3. 최근 업데이트된 raw_wines 확인 (updated_at 혹은 created_at 기준)
  console.log("\n[최근 변경된 row 5건 (raw_payload 키 확인)]");
  const { data: recent } = await sb
    .from("raw_wines")
    .select("id, source, name_en, raw_payload, updated_at")
    .order("updated_at", { ascending: false })
    .limit(5);
  for (const r of recent ?? []) {
    const keys = r.raw_payload ? Object.keys(r.raw_payload as object).filter((k) => k.startsWith("parsed_") || k.startsWith("llm_")).join(",") : "-";
    console.log(`  ${r.updated_at} [${r.source}] ${r.name_en?.slice(0, 50)}... llm_keys=${keys || "none"}`);
  }

  // 4. raw_payload 안에 parsed_ 접두사 키가 하나라도 있는 row
  console.log("\n[raw_payload 키 샘플링]");
  const { data: sample } = await sb
    .from("raw_wines")
    .select("id, raw_payload")
    .eq("source", "wine21")
    .limit(3);
  for (const r of sample ?? []) {
    const keys = r.raw_payload ? Object.keys(r.raw_payload as object) : [];
    console.log(`  id=${r.id.slice(0, 8)} keys=${keys.slice(0, 20).join(",")}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
