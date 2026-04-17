import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { count: total } = await sb.from("raw_wines").select("*", { count: "exact", head: true }).eq("source", "wine21");
  const { count: parsed } = await sb.from("raw_wines").select("*", { count: "exact", head: true }).eq("source", "wine21").not("raw_payload->>llm_parsed_at", "is", null);
  console.log("wine21 전체:", total);
  console.log("  llm_parsed_at 있음:", parsed);
  console.log("  미처리:", (total ?? 0) - (parsed ?? 0));
}
main().catch((e) => { console.error(e); process.exit(1); });
