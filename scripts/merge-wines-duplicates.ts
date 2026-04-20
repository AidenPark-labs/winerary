/**
 * wines 중복 병합 실행
 *
 * 실행:
 *   NODE_ENV=development npx tsx scripts/merge-wines-duplicates.ts --dry-run
 *   NODE_ENV=development npx tsx scripts/merge-wines-duplicates.ts
 *
 * 의존: backup/v3-dup-merge-map.json (analyze-wines-duplicates.ts 산출물)
 *
 * 흐름 (각 그룹마다):
 *   1. canonical의 NULL 필드를 dup에서 가져와 보강
 *   2. FK 재연결: wine_records, wine_wishlist, evaluations, raw_wines, pending_wines
 *   3. dup wines DELETE
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

interface MergeEntry {
  canonical_id: string;
  canonical_source: string;
  canonical_name_ko: string;
  dup_ids: string[];
}

const NULLABLE_FIELDS = [
  "name_en",
  "country",
  "country_ko",
  "region",
  "region_path",
  "region_ko",
  "grape_variety",
  "grape_varieties",
  "grape_varieties_ko",
  "wine_style",
  "wine_style_ko",
  "winery_en_clean",
  "brand",
  "search_query_en",
  "producer",
  "producer_ko",
  "producer_en",
  "description",
  "price",
  "naver_link",
  "naver_image",
  "image_url",
  "vivino_url",
  "vivino_page_url",
  "vivino_wine_id",
  "vivino_rating",
  "vivino_reviews",
  "vivino_winery",
  "vivino_grapes",
  "vivino_region",
  "vivino_style",
  "vivino_alcohol",
  "vivino_description",
];

async function main() {
  const mapPath = "./backup/v3-dup-merge-map.json";
  const mergeMap: MergeEntry[] = JSON.parse(fs.readFileSync(mapPath, "utf-8"));
  console.log(`📥 병합 계획: ${mergeMap.length} 그룹, ${mergeMap.reduce((s, m) => s + m.dup_ids.length, 0)} 개 dup 삭제 예정\n`);

  if (DRY_RUN) {
    console.log("[DRY-RUN] 실행 안 함\n");
    return;
  }

  let mergedGroups = 0;
  let relinkedRecords = 0;
  let relinkedWishlist = 0;
  let relinkedEvaluations = 0;
  let relinkedRaw = 0;
  let relinkedPending = 0;
  let deletedWines = 0;
  let errors = 0;

  for (let i = 0; i < mergeMap.length; i++) {
    const m = mergeMap[i];
    try {
      // 1) canonical 필드 보강
      const { data: canonical } = await sb
        .from("wines")
        .select(NULLABLE_FIELDS.join(","))
        .eq("id", m.canonical_id)
        .single();

      if (!canonical) {
        console.warn(`  ⚠️ canonical ${m.canonical_id} 없음 (${m.canonical_name_ko}) - skip`);
        errors++;
        continue;
      }

      const { data: dups } = await sb
        .from("wines")
        .select(`id, ${NULLABLE_FIELDS.join(",")}`)
        .in("id", m.dup_ids);

      if (dups && dups.length > 0) {
        const updates: Record<string, unknown> = {};
        for (const field of NULLABLE_FIELDS) {
          const canonVal = (canonical as Record<string, unknown>)[field];
          if (canonVal === null || canonVal === undefined || canonVal === "" || (Array.isArray(canonVal) && canonVal.length === 0)) {
            // dup 중 값 있는 것 찾기
            for (const d of dups) {
              const dupVal = (d as Record<string, unknown>)[field];
              if (dupVal !== null && dupVal !== undefined && dupVal !== "" && !(Array.isArray(dupVal) && dupVal.length === 0)) {
                updates[field] = dupVal;
                break;
              }
            }
          }
        }
        if (Object.keys(updates).length > 0) {
          const { error: upErr } = await sb.from("wines").update(updates).eq("id", m.canonical_id);
          if (upErr) console.warn(`  ⚠️ canonical 보강 실패 (${m.canonical_name_ko}): ${upErr.message}`);
        }
      }

      // 2) FK 재연결
      for (const dupId of m.dup_ids) {
        const { data: wr, error: wrErr } = await sb
          .from("wine_records")
          .update({ wine_id: m.canonical_id })
          .eq("wine_id", dupId)
          .select("id");
        if (wrErr) throw wrErr;
        relinkedRecords += wr?.length ?? 0;

        const { data: wl, error: wlErr } = await sb
          .from("wine_wishlist")
          .update({ wine_id: m.canonical_id })
          .eq("wine_id", dupId)
          .select("id");
        if (wlErr) throw wlErr;
        relinkedWishlist += wl?.length ?? 0;

        const { data: ev, error: evErr } = await sb
          .from("evaluations")
          .update({ wine_id: m.canonical_id })
          .eq("wine_id", dupId)
          .select("id");
        if (evErr) throw evErr;
        relinkedEvaluations += ev?.length ?? 0;

        const { data: rw, error: rwErr } = await sb
          .from("raw_wines")
          .update({ promoted_wine_id: m.canonical_id })
          .eq("promoted_wine_id", dupId)
          .select("id");
        if (rwErr) throw rwErr;
        relinkedRaw += rw?.length ?? 0;

        const { data: pw, error: pwErr } = await sb
          .from("pending_wines")
          .update({ promoted_wine_id: m.canonical_id })
          .eq("promoted_wine_id", dupId)
          .select("id");
        if (pwErr) throw pwErr;
        relinkedPending += pw?.length ?? 0;
      }

      // 3) dup DELETE
      const { error: delErr } = await sb.from("wines").delete().in("id", m.dup_ids);
      if (delErr) throw delErr;
      deletedWines += m.dup_ids.length;

      mergedGroups++;
      if ((i + 1) % 20 === 0) {
        process.stdout.write(`\r  진행 ${i + 1}/${mergeMap.length}  병합 ${mergedGroups}  삭제 ${deletedWines}  `);
      }
    } catch (e) {
      errors++;
      console.error(`\n  ❌ ${m.canonical_name_ko} (${m.canonical_id}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  process.stdout.write("\n");

  console.log("\n═══ 완료 ═══");
  console.log(`  병합 그룹: ${mergedGroups} / ${mergeMap.length}`);
  console.log(`  삭제된 wines: ${deletedWines}`);
  console.log(`  재연결: wine_records ${relinkedRecords}, wishlist ${relinkedWishlist}, evaluations ${relinkedEvaluations}, raw_wines ${relinkedRaw}, pending ${relinkedPending}`);
  console.log(`  에러: ${errors}`);

  // 검증
  const { count: total } = await sb.from("wines").select("*", { count: "exact", head: true });
  console.log(`\n  wines 총 ${total?.toLocaleString()} 건 (기대: 17,438)`);

  const { data: remainingDup } = await sb
    .from("wines")
    .select("name_en")
    .not("name_en", "is", null);
  const nameCounts = new Map<string, number>();
  for (const w of remainingDup ?? []) {
    const key = (w.name_en as string).trim();
    if (!key) continue;
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  const remainingDupGroups = Array.from(nameCounts.entries()).filter(([, c]) => c > 1).length;
  console.log(`  남은 중복 그룹: ${remainingDupGroups} (기대: 0)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
