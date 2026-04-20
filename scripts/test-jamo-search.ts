import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

(async () => {
  const queries = ["킬러맨스", "킬러맨즈", "킬러맨스런", "킬러맨즈런", "킬리카눈", "까베르네", "카베르네", "샤르도네", "샤도네"];

  for (const q of queries) {
    const { data, error } = await sb.rpc("search_wines", { q, k: 100 });
    if (error) {
      console.log(`${q}: ERROR ${error.message}`);
      continue;
    }
    console.log(`\n[${q}] ${data?.length ?? 0}건`);
    for (const w of (data as Array<{ name_ko: string; score: number }> ?? []).slice(0, 5)) {
      console.log(`  ${w.score.toFixed(3)}  ${w.name_ko}`);
    }
  }
})();
