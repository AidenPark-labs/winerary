import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { count: matched } = await sb.from("raw_wines").select("*", { count: "exact", head: true }).eq("source","wine21").not("raw_payload->>vivino_url","is",null);
  const { count: rematched } = await sb.from("raw_wines").select("*", { count: "exact", head: true }).eq("raw_payload->>vivino_rematched","true");
  const { count: tried } = await sb.from("raw_wines").select("*", { count: "exact", head: true }).not("raw_payload->>vivino_rematch_tried_at","is",null);
  const { count: totalTarget } = await sb.from("raw_wines").select("*", { count: "exact", head: true })
    .eq("source","wine21")
    .is("raw_payload->>vivino_url", null)
    .not("raw_payload->>parsed_search_query","is",null)
    .neq("raw_payload->>parsed_search_query","");
  console.log("vivino_url 유효 (전체):", matched);
  console.log("rematched=true (v4로 성공):", rematched);
  console.log("rematch_tried_at (v4로 시도됨, 실패 포함):", tried);
  console.log("남은 대상 (미매칭 + query 존재):", totalTarget);
}
main().catch((e) => { console.error(e); process.exit(1); });
