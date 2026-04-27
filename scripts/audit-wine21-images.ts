/**
 * wine21 source 와인의 이미지 보유 현황 + 보강 가능성 점검 (count head 위주, 메모리 안전).
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function countSrc(table: "wines" | "raw_wines", source: string, extra?: (q: any) => any) {
  let q = sb.from(table).select("id", { count: "exact", head: true }).eq("source", source);
  if (extra) q = extra(q);
  const { count, error } = await q;
  if (error) console.error(`count error (${table}/${source}):`, error.message);
  return count ?? 0;
}

async function main() {
  // 1. wines.source 분포 — 주요 source만
  console.log("=== wines.source 분포 ===");
  const sources = ["wine21", "naver_shopping", "gangnam", "winenara", "user_submission", "admin"];
  for (const s of sources) {
    const c = await countSrc("wines", s);
    if (c > 0) console.log(`  ${s}: ${c}`);
  }

  // 2. wine21 이미지 보유율
  const w21Total = await countSrc("wines", "wine21");
  const w21WithImage = await countSrc("wines", "wine21", (q) => q.not("image_url", "is", null));
  const w21WithNaver = await countSrc("wines", "wine21", (q) => q.not("naver_image", "is", null));
  console.log(`\n=== wine21 wines 이미지 ===`);
  console.log(`전체: ${w21Total}`);
  console.log(`image_url 있음: ${w21WithImage} (${((w21WithImage/(w21Total||1))*100).toFixed(1)}%)`);
  console.log(`naver_image 있음: ${w21WithNaver}`);

  // 3. raw_wines source='wine21' 카운트
  const rawW21Total = await countSrc("raw_wines", "wine21");
  const rawW21WithImage = await countSrc("raw_wines", "wine21", (q) => q.not("image_url", "is", null));
  console.log(`\n=== raw_wines source='wine21' ===`);
  console.log(`전체: ${rawW21Total}`);
  console.log(`raw_wines.image_url 있음: ${rawW21WithImage} (${((rawW21WithImage/(rawW21Total||1))*100).toFixed(1)}%)`);

  // 4. raw_wines.raw_payload 안에 이미지 키가 있는지 (5건 샘플)
  const { data: rawSamples } = await sb
    .from("raw_wines").select("id, name_ko, image_url, raw_payload").eq("source", "wine21").limit(5);
  console.log(`\n=== raw_wines wine21 샘플 5건 ===`);
  for (const r of rawSamples ?? []) {
    const payload = r.raw_payload as any;
    const imgKeys = payload && typeof payload === "object"
      ? Object.keys(payload).filter((k) => /image|img|photo|thumb/i.test(k))
      : [];
    console.log(`  id=${r.id.slice(0,8)} | name=${r.name_ko}`);
    console.log(`    raw_wines.image_url: ${r.image_url ?? "(NULL)"}`);
    if (imgKeys.length > 0) {
      for (const k of imgKeys) console.log(`    raw_payload.${k}: ${String(payload[k]).slice(0, 120)}`);
    } else {
      console.log(`    raw_payload 안 image 관련 키: 없음`);
    }
  }

  // 5. backfill 후보 — raw_wines.image_url 있고 promoted_wine_id 있고 연결된 wines.image_url null
  console.log(`\n=== backfill 후보 (raw_wines image_url ↔ wines image_url null) ===`);
  let pageSize = 1000;
  let offset = 0;
  let backfillable = 0;
  let scanned = 0;
  while (true) {
    const { data, error } = await sb
      .from("raw_wines")
      .select("image_url, promoted_wine_id")
      .eq("source", "wine21")
      .not("image_url", "is", null)
      .not("promoted_wine_id", "is", null)
      .range(offset, offset + pageSize - 1);
    if (error) { console.error(error.message); break; }
    if (!data || data.length === 0) break;
    scanned += data.length;
    const ids = data.map((r) => r.promoted_wine_id).filter(Boolean) as string[];
    if (ids.length > 0) {
      const { data: linked } = await sb.from("wines").select("id, image_url").in("id", ids);
      const map = new Map<string, string | null>();
      for (const w of linked ?? []) map.set(w.id, w.image_url);
      for (const r of data) {
        if (r.promoted_wine_id && map.get(r.promoted_wine_id) == null) backfillable++;
      }
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  console.log(`  스캔: ${scanned}건 / backfill 후보: ${backfillable}건`);
}

main().catch((e) => { console.error(e); process.exit(1); });
