import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { count: total } = await sb.from("raw_wines").select("*", { count: "exact", head: true }).eq("source", "wine21");
  const { count: matched } = await sb.from("raw_wines").select("*", { count: "exact", head: true }).eq("source", "wine21").not("raw_payload->>vivino_url", "is", null);
  const { count: untagged } = await sb.from("raw_wines").select("*", { count: "exact", head: true }).eq("source", "wine21").not("raw_payload->>vivino_untag_reason", "is", null);
  const { count: untagGrape } = await sb.from("raw_wines").select("*", { count: "exact", head: true }).eq("raw_payload->>vivino_untag_reason", "grape_conflict");
  const { count: untagStyle } = await sb.from("raw_wines").select("*", { count: "exact", head: true }).eq("raw_payload->>vivino_untag_reason", "style_conflict");
  console.log("wine21 전체:", total);
  console.log("  현재 vivino_url 유효:", matched);
  console.log("  untag 이력 있음:", untagged);
  console.log("    grape_conflict:", untagGrape);
  console.log("    style_conflict:", untagStyle);
  console.log(`  매칭률: ${(((matched ?? 0) / (total ?? 1)) * 100).toFixed(1)}%`);
}
main().catch((e) => { console.error(e); process.exit(1); });
