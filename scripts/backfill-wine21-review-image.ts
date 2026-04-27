/**
 * raw_wines(source=wine21).raw_payload.image_path → wines.review_image_url 채우기.
 *   - placeholder (`/no_image*`) 제외
 *   - 절대 URL = https://img.wine21.com + path
 *   - 기존 review_image_url이 NULL인 행만 (덮어쓰기 안 함)
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const HOST = "https://img.wine21.com";
const PAGE = 1000;

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  // 1) wines.review_image_url IS NULL인 wine21 와인의 id 풀
  console.log("review_image_url IS NULL & source=wine21 와인 id 수집…");
  const targetWineIds = new Set<string>();
  let off = 0;
  while (true) {
    const { data, error } = await sb
      .from("wines")
      .select("id")
      .eq("source", "wine21")
      .is("review_image_url", null)
      .range(off, off + PAGE - 1);
    if (error) { console.error(error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    for (const r of data) targetWineIds.add(r.id);
    if (data.length < PAGE) break;
    off += PAGE;
  }
  console.log(`타겟 wines: ${targetWineIds.size}`);

  // 2) raw_wines source=wine21 + promoted_wine_id 있는 + image_path 있는 행 페이지로 순회
  console.log("\nraw_wines 스캔…");
  const updates: { id: string; url: string }[] = [];
  let scanned = 0, withImage = 0, placeholder = 0, notLinked = 0, alreadyHas = 0;
  off = 0;
  while (true) {
    const { data, error } = await sb
      .from("raw_wines")
      .select("promoted_wine_id, raw_payload")
      .eq("source", "wine21")
      .not("promoted_wine_id", "is", null)
      .not("raw_payload->>image_path", "is", null)
      .range(off, off + PAGE - 1);
    if (error) { console.error(error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    scanned += data.length;
    for (const r of data) {
      const path = (r.raw_payload as any)?.image_path as string | undefined;
      if (!path) continue;
      withImage++;
      if (/no_image/i.test(path)) { placeholder++; continue; }
      const wid = r.promoted_wine_id as string | null;
      if (!wid) { notLinked++; continue; }
      if (!targetWineIds.has(wid)) { alreadyHas++; continue; }
      updates.push({ id: wid, url: HOST + path });
      targetWineIds.delete(wid); // 같은 wine_id에 여러 raw 행 있을 때 첫 것만
    }
    if (data.length < PAGE) break;
    off += PAGE;
  }

  console.log(`스캔: ${scanned}건`);
  console.log(`  image_path 있음: ${withImage}`);
  console.log(`  placeholder 제외: -${placeholder}`);
  console.log(`  연결 안 됨 (promoted_wine_id null): -${notLinked}`);
  console.log(`  이미 review_image_url 있음: -${alreadyHas}`);
  console.log(`  업데이트 대상: ${updates.length}\n`);

  if (dryRun) {
    console.log("(--dry-run) UPDATE 스킵. 샘플 5건:");
    for (const u of updates.slice(0, 5)) console.log(`  ${u.id} → ${u.url}`);
    return;
  }

  // 3) 청크 단위 UPDATE (id별 다른 값이라 in-batch 일괄 update 불가, 개별 update)
  console.log("UPDATE 진행…");
  const CHUNK = 100;
  let done = 0;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const slice = updates.slice(i, i + CHUNK);
    await Promise.all(
      slice.map(async (u) => {
        const { error } = await sb.from("wines").update({ review_image_url: u.url }).eq("id", u.id);
        if (error) console.error(`  fail ${u.id}: ${error.message}`);
      }),
    );
    done += slice.length;
    if (done % 1000 === 0 || done === updates.length) console.log(`  ${done}/${updates.length}`);
  }
  console.log(`\n완료: ${done}건 review_image_url 채움.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
