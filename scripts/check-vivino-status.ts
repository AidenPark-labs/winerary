import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { count: total } = await sb.from("raw_wines").select("*", { count: "exact", head: true });
  const { count: matched } = await sb.from("raw_wines").select("*", { count: "exact", head: true }).not("raw_payload->>vivino_url", "is", null);
  const { count: scraped } = await sb.from("raw_wines").select("*", { count: "exact", head: true }).not("raw_payload->>vivino_scraped_at", "is", null);
  const { count: matchFailed } = await sb.from("raw_wines").select("*", { count: "exact", head: true }).eq("raw_payload->>vivino_match_failed", "true");

  console.log("전체 raw_wines:", total);
  console.log("vivino_url 있음 (매칭 성공):", matched);
  console.log("vivino 스크랩 시도됨:", scraped);
  console.log("match_failed 플래그:", matchFailed);
  console.log("미처리 (vivino_scraped_at 없음):", (total ?? 0) - (scraped ?? 0));

  const { data: recent } = await sb
    .from("raw_wines")
    .select("id, raw_payload")
    .not("raw_payload->>vivino_scraped_at", "is", null)
    .order("raw_payload->>vivino_scraped_at", { ascending: false })
    .limit(5);
  console.log("\n최근 스크랩 5건:");
  for (const r of recent ?? []) {
    const p = r.raw_payload as Record<string, unknown>;
    console.log(`  ${p.vivino_scraped_at} | match_failed=${p.vivino_match_failed ?? false} | ${p.vivino_name ?? "(N/A)"}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
