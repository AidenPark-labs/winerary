import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

(async () => {
  // term_dict grape 전체
  const { data } = await sb.from("term_dict").select("en, ko, aliases").eq("category", "grape").order("en");
  console.log(`grape 엔트리: ${data?.length}`);

  // '카'로 시작하는 품종
  const kaList = (data ?? []).filter((e) => e.ko?.startsWith("카"));
  console.log(`\n['카' 시작] ${kaList.length}건 (후보: → '까')`);
  for (const e of kaList) console.log(`  ${e.en.padEnd(30)} ${e.ko}  aliases=${JSON.stringify(e.aliases)}`);

  // 품종 한글 접두 통계
  const prefixCounts = new Map<string, number>();
  for (const e of data ?? []) {
    const p = (e.ko ?? "").slice(0, 1);
    if (p) prefixCounts.set(p, (prefixCounts.get(p) ?? 0) + 1);
  }
  console.log(`\n[한글 접두 분포]`);
  for (const [p, c] of [...prefixCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`  ${p}: ${c}`);
  }

  // wines에서 실제 grape_varieties_ko 사용 빈도
  const { data: allWines } = await sb.from("wines").select("grape_varieties_ko").not("grape_varieties_ko", "is", null);
  const useCounts = new Map<string, number>();
  for (const w of allWines ?? []) {
    for (const g of (w.grape_varieties_ko ?? []) as string[]) {
      useCounts.set(g, (useCounts.get(g) ?? 0) + 1);
    }
  }
  const topKa = [...useCounts.entries()].filter(([g]) => g.startsWith("카")).sort((a, b) => b[1] - a[1]);
  console.log(`\n[wines에서 '카'로 시작하는 품종 사용 빈도]`);
  for (const [g, c] of topKa.slice(0, 20)) console.log(`  ${String(c).padStart(5)}  ${g}`);
})();
