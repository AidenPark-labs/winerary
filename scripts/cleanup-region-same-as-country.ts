import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

(async () => {
  // region_path == country인 행 수집 (pagination)
  const all: Array<Record<string, unknown>> = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from("wines")
      .select("id, country, country_ko, region_path, region_ko")
      .not("region_path", "is", null)
      .order("id")
      .range(offset, offset + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as Array<Record<string, unknown>>));
    if (data.length < 1000) break;
    offset += data.length;
  }
  console.log(`region_path 있는 wines: ${all.length}`);

  const targets: string[] = [];
  for (const w of all ?? []) {
    const c = ((w.country as string) ?? "").trim();
    const rp = ((w.region_path as string) ?? "").trim();
    const cko = ((w.country_ko as string) ?? "").trim();
    const rko = ((w.region_ko as string) ?? "").trim();
    if ((c && rp && c === rp) || (cko && rko && cko === rko)) {
      targets.push(w.id as string);
    }
  }
  console.log(`정리 대상: ${targets.length}건`);

  let updated = 0;
  let errors = 0;
  for (const id of targets) {
    const { error } = await sb
      .from("wines")
      .update({ region_path: null, region_ko: null })
      .eq("id", id);
    if (error) { errors++; console.error(error.message); } else updated++;
  }
  console.log(`UPDATE 성공: ${updated} / 에러: ${errors}`);

  // 검증 (pagination)
  const check: Array<Record<string, unknown>> = [];
  let offset2 = 0;
  while (true) {
    const { data, error } = await sb
      .from("wines")
      .select("country, region_path")
      .not("region_path", "is", null)
      .order("id")
      .range(offset2, offset2 + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    check.push(...(data as Array<Record<string, unknown>>));
    if (data.length < 1000) break;
    offset2 += data.length;
  }
  let remaining = 0;
  for (const r of check) {
    if (((r.country as string) ?? "").trim() === ((r.region_path as string) ?? "").trim()) remaining++;
  }
  console.log(`남은 region==country: ${remaining}`);
})();
