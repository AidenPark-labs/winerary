import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

(async () => {
  const { data } = await sb
    .from("wines")
    .select("id, name_ko, source, data_source, country")
    .or("name_en.is.null,name_en.eq.");
  console.log("빈 name_en 와인:");
  for (const w of data ?? [])
    console.log(`  [${w.source ?? w.data_source}] ${w.name_ko} (${w.country})`);
  console.log(`총 ${data?.length ?? 0}건`);
})();
