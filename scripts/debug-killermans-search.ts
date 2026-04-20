import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

(async () => {
  console.log("═══ 킬러맨스 검색 디버그 ═══\n");

  // 1. 현재 Kilikanoon Killerman's Run 관련 wines
  const { data: wines } = await sb
    .from("wines")
    .select("id, name_ko, name_en, source")
    .or("name_en.ilike.%Killerman%,name_ko.ilike.%킬러맨%");
  console.log("[현재 wines에 있는 관련 와인]");
  for (const w of wines ?? []) {
    console.log(`  [${w.source}] ${w.name_ko} / ${w.name_en}`);
  }

  // 2. search_wines RPC 결과
  console.log("\n[search_wines('킬러맨스') 결과]");
  const { data: rpc1 } = await sb.rpc("search_wines", { q: "킬러맨스", k: 10 });
  console.log(`  ${rpc1?.length ?? 0}건`);
  for (const r of (rpc1 as Array<{ name_ko: string; score: number }>) ?? []) {
    console.log(`  ${(r as { score: number }).score.toFixed(3)}  ${r.name_ko}`);
  }

  console.log("\n[search_wines('킬러맨즈') 결과]");
  const { data: rpc2 } = await sb.rpc("search_wines", { q: "킬러맨즈", k: 10 });
  console.log(`  ${rpc2?.length ?? 0}건`);
  for (const r of (rpc2 as Array<{ name_ko: string; score: number }>) ?? []) {
    console.log(`  ${r.score.toFixed(3)}  ${r.name_ko}`);
  }

  console.log("\n[search_wines('킬러맨스런') 결과]");
  const { data: rpc3 } = await sb.rpc("search_wines", { q: "킬러맨스런", k: 10 });
  console.log(`  ${rpc3?.length ?? 0}건`);
  for (const r of (rpc3 as Array<{ name_ko: string; score: number }>) ?? []) {
    console.log(`  ${r.score.toFixed(3)}  ${r.name_ko}`);
  }

  // 3. search_tsv 토큰 확인 (RPC 없이 직접)
  console.log("\n[search_tsv에서 '킬러맨스' 토큰 매칭 시도]");
  const { data: tsvHits } = await sb
    .from("wines")
    .select("name_ko")
    .or("name_ko.ilike.%킬러맨%")
    .limit(5);
  console.log("  ilike 대조:");
  for (const h of tsvHits ?? []) console.log(`    ${h.name_ko}`);
})();
