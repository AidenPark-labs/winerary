import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

(async () => {
  const { data: before } = await sb
    .from("wines")
    .select("id, name_ko, search_jamo")
    .eq("name_en", "Bogle Merlot")
    .single();
  if (!before) { console.log("테스트 대상 없음"); return; }
  console.log("[before]");
  console.log("  name_ko:    ", before.name_ko);
  console.log("  search_jamo:", (before.search_jamo as string).slice(0, 80));

  const testName = (before.name_ko as string) + "_테스트";
  await sb.from("wines").update({ name_ko: testName }).eq("id", before.id);

  const { data: after } = await sb
    .from("wines")
    .select("name_ko, search_jamo")
    .eq("id", before.id)
    .single();
  console.log("\n[after UPDATE]");
  console.log("  name_ko:    ", after?.name_ko);
  console.log("  search_jamo:", (after?.search_jamo as string).slice(0, 80));

  await sb.from("wines").update({ name_ko: before.name_ko }).eq("id", before.id);
  console.log("\n[복원 완료]");
})();
