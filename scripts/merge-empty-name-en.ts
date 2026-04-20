/**
 * 빈 name_en 13건(winenara) → name_ko 유사도로 wine21/naver 와인에 병합
 *
 * 실행:
 *   NODE_ENV=development npx tsx scripts/merge-empty-name-en.ts --dry-run
 *   NODE_ENV=development npx tsx scripts/merge-empty-name-en.ts
 *
 * 매칭 기준: name_ko 공백/구두점 제거 후 비교. 임계값 이상 유사도만.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DRY_RUN = process.argv.slice(2).includes("--dry-run");

function normalize(s: string): string {
  return s.replace(/[\s\-·()[\]{}]/g, "").replace(/\[.*?\]/g, "").toLowerCase();
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  // char n-gram Jaccard
  const grams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const ga = grams(na);
  const gb = grams(nb);
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return inter / (ga.size + gb.size - inter);
}

async function main() {
  // 빈 name_en 후보 (winenara)
  const { data: empties } = await sb
    .from("wines")
    .select("id, name_ko, source, data_source, country")
    .or("name_en.is.null,name_en.eq.");
  console.log(`빈 name_en 대상: ${empties?.length ?? 0}건`);

  // 전체 wines (매칭 후보) — name_en 있는 것만
  const allCandidates: Array<{ id: string; name_ko: string; name_en: string; country: string | null }> = [];
  let offset = 0;
  while (true) {
    const { data } = await sb
      .from("wines")
      .select("id, name_ko, name_en, country")
      .not("name_en", "is", null)
      .neq("name_en", "")
      .order("id")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    allCandidates.push(...(data as typeof allCandidates));
    if (data.length < 1000) break;
    offset += data.length;
  }
  console.log(`후보 wines (name_en 있음): ${allCandidates.length.toLocaleString()}`);

  const THRESHOLD = 0.7;
  const mappings: Array<{ dup_id: string; dup_name: string; canonical_id: string; canonical_name: string; sim: number }> = [];
  const unmatched: Array<{ id: string; name_ko: string }> = [];

  for (const e of empties ?? []) {
    let best: { id: string; name_ko: string; sim: number } | null = null;
    for (const c of allCandidates) {
      // 국가 필터 (다르면 제외)
      if (e.country && c.country && e.country !== c.country) continue;
      const s = similarity(e.name_ko as string, c.name_ko);
      if (s >= THRESHOLD && (!best || s > best.sim)) {
        best = { id: c.id, name_ko: c.name_ko, sim: s };
      }
    }
    if (best) {
      mappings.push({
        dup_id: e.id as string,
        dup_name: e.name_ko as string,
        canonical_id: best.id,
        canonical_name: best.name_ko,
        sim: best.sim,
      });
    } else {
      unmatched.push({ id: e.id as string, name_ko: e.name_ko as string });
    }
  }

  console.log(`\n매칭된: ${mappings.length}`);
  for (const m of mappings) {
    console.log(`  [${(m.sim * 100).toFixed(0)}%] ${m.dup_name} → ${m.canonical_name}`);
  }
  console.log(`\n매칭 안 된: ${unmatched.length}`);
  for (const u of unmatched) {
    console.log(`  ${u.name_ko}`);
  }

  if (DRY_RUN) {
    console.log("\n[DRY-RUN] 실행 안 함");
    return;
  }

  // 매칭된 것만 병합 (dup 삭제)
  let merged = 0;
  let errors = 0;
  for (const m of mappings) {
    try {
      // FK 재연결
      await sb.from("wine_records").update({ wine_id: m.canonical_id }).eq("wine_id", m.dup_id);
      await sb.from("wine_wishlist").update({ wine_id: m.canonical_id }).eq("wine_id", m.dup_id);
      await sb.from("evaluations").update({ wine_id: m.canonical_id }).eq("wine_id", m.dup_id);
      await sb.from("raw_wines").update({ promoted_wine_id: m.canonical_id }).eq("promoted_wine_id", m.dup_id);
      await sb.from("pending_wines").update({ promoted_wine_id: m.canonical_id }).eq("promoted_wine_id", m.dup_id);
      // dup DELETE
      const { error } = await sb.from("wines").delete().eq("id", m.dup_id);
      if (error) throw error;
      merged++;
    } catch (e) {
      errors++;
      console.error(`  ❌ ${m.dup_name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`\n병합 성공: ${merged} / 에러: ${errors}`);

  // 매칭 안 된 건도 DELETE (raw_wines에 역이관본 있어 보존됨)
  let deleted = 0;
  let deleteErrors = 0;
  for (const u of unmatched) {
    try {
      await sb.from("wine_records").update({ wine_id: null }).eq("wine_id", u.id);
      await sb.from("wine_wishlist").update({ wine_id: null }).eq("wine_id", u.id);
      await sb.from("evaluations").update({ wine_id: null }).eq("wine_id", u.id);
      await sb.from("raw_wines").update({ promoted_wine_id: null }).eq("promoted_wine_id", u.id);
      await sb.from("pending_wines").update({ promoted_wine_id: null }).eq("promoted_wine_id", u.id);
      const { error } = await sb.from("wines").delete().eq("id", u.id);
      if (error) throw error;
      deleted++;
    } catch (e) {
      deleteErrors++;
      console.error(`  ❌ DELETE ${u.name_ko}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`매칭 안 된 건 DELETE: ${deleted} / 에러: ${deleteErrors}`);

  const { count: total } = await sb.from("wines").select("*", { count: "exact", head: true });
  console.log(`\nwines 총 ${total?.toLocaleString()}건`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
