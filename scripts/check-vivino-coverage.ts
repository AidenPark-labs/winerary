import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

(async () => {
  const sources = ["wine21", "naver_shopping", "gangnam", "winenara", "user_submission"];
  console.log("[source별 Vivino 커버리지]\n");

  let totalAll = 0;
  let totalWithRating = 0;
  let totalWithUrl = 0;
  let totalWithPageUrl = 0;

  for (const s of sources) {
    const { count: all } = await sb.from("wines").select("*", { count: "exact", head: true }).eq("source", s);
    const { count: withRating } = await sb.from("wines").select("*", { count: "exact", head: true }).eq("source", s).not("vivino_rating", "is", null);
    const { count: withUrl } = await sb.from("wines").select("*", { count: "exact", head: true }).eq("source", s).not("vivino_url", "is", null);
    const { count: withPageUrl } = await sb.from("wines").select("*", { count: "exact", head: true }).eq("source", s).not("vivino_page_url", "is", null);

    console.log(`${s.padEnd(18)} 전체 ${String(all ?? 0).padStart(6)}`);
    console.log(`  vivino_rating:  ${String(withRating ?? 0).padStart(6)}  (${(((withRating ?? 0) / (all ?? 1)) * 100).toFixed(1)}%)`);
    console.log(`  vivino_url:     ${String(withUrl ?? 0).padStart(6)}  (${(((withUrl ?? 0) / (all ?? 1)) * 100).toFixed(1)}%)`);
    console.log(`  vivino_page_url:${String(withPageUrl ?? 0).padStart(6)}  (${(((withPageUrl ?? 0) / (all ?? 1)) * 100).toFixed(1)}%)`);
    console.log();

    totalAll += all ?? 0;
    totalWithRating += withRating ?? 0;
    totalWithUrl += withUrl ?? 0;
    totalWithPageUrl += withPageUrl ?? 0;
  }

  console.log("━".repeat(50));
  console.log(`합계              전체 ${totalAll.toLocaleString()}`);
  console.log(`  vivino_rating:  ${totalWithRating.toLocaleString()} (${((totalWithRating / totalAll) * 100).toFixed(1)}%)`);
  console.log(`  vivino_url:     ${totalWithUrl.toLocaleString()} (${((totalWithUrl / totalAll) * 100).toFixed(1)}%)`);
  console.log(`  vivino_page_url:${totalWithPageUrl.toLocaleString()} (${((totalWithPageUrl / totalAll) * 100).toFixed(1)}%)`);
})();
