import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

(async () => {
  // region_ko === country_ko 인 건수
  const { data: rows } = await sb
    .from("wines")
    .select("id, name_ko, country, country_ko, region, region_path, region_ko, source")
    .not("region_path", "is", null)
    .limit(50000);

  let sameAsCountry = 0;
  let diffFromCountry = 0;
  const samples: Array<Record<string, unknown>> = [];

  for (const w of rows ?? []) {
    const rko = (w.region_ko as string | null) ?? null;
    const cko = (w.country_ko as string | null) ?? null;
    const rp  = (w.region_path as string | null) ?? null;
    const c   = (w.country as string | null) ?? null;
    if (rko && cko && rko.trim() === cko.trim()) sameAsCountry++;
    else if (rp && c && rp.trim() === c.trim()) sameAsCountry++;
    else if (rp) diffFromCountry++;
    if (sameAsCountry <= 10 && (rko === cko || rp === c)) samples.push(w as never);
  }
  console.log(`region == country (값 동일): ${sameAsCountry}`);
  console.log(`region != country (정상):    ${diffFromCountry}`);
  console.log("\n[동일 샘플 10건]");
  for (const w of samples.slice(0, 10)) {
    console.log(`  [${w.source}] ${w.name_ko} | country=${w.country}/${w.country_ko} | region_path=${w.region_path}/${w.region_ko}`);
  }

  // source별 분포
  console.log("\n[source별: region_path == country 건수]");
  for (const src of ["wine21", "naver_shopping", "gangnam", "winenara"]) {
    const { count: total } = await sb
      .from("wines")
      .select("*", { count: "exact", head: true })
      .eq("source", src)
      .not("region_path", "is", null);
    const { count: matching } = await sb
      .from("wines")
      .select("*", { count: "exact", head: true })
      .eq("source", src)
      .not("region_path", "is", null)
      .filter("region_path", "eq", "country");
    // Supabase-js에서는 컬럼 비교 불가 — 우회: 모든 rows 가져와 JS에서 비교
    const { data: all } = await sb
      .from("wines")
      .select("country, region_path")
      .eq("source", src)
      .not("region_path", "is", null);
    let eq = 0;
    for (const r of all ?? []) {
      if ((r.country ?? "").trim() === ((r.region_path as string) ?? "").trim()) eq++;
    }
    console.log(`  ${src.padEnd(18)} region_path 있음: ${total}  중 country와 동일: ${eq}`);
  }
})();
