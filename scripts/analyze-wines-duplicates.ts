/**
 * wines 테이블 중복 그룹 분석 (name_en 기준) — READ ONLY
 *
 * 실행: NODE_ENV=development npx tsx scripts/analyze-wines-duplicates.ts
 *
 * canonical 선정 규칙:
 *   source 우선순위: wine21 > naver_shopping > winenara > user_submission > gangnam > 기타
 *   동률 시 created_at 오래된 것
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SOURCE_RANK: Record<string, number> = {
  naver_shopping: 1,
  wine21: 2,
  winenara: 3,
  user_submission: 4,
  gangnam: 5,
};

interface WineRow {
  id: string;
  name_ko: string;
  name_en: string | null;
  source: string | null;
  data_source: string | null;
  created_at: string;
}

async function loadAllWines(): Promise<WineRow[]> {
  const all: WineRow[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from("wines")
      .select("id, name_ko, name_en, source, data_source, created_at")
      .order("id")
      .range(offset, offset + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as WineRow[]));
    if (data.length < 1000) break;
    offset += data.length;
  }
  return all;
}

function rankSource(s: string | null): number {
  if (!s) return 99;
  return SOURCE_RANK[s] ?? 9;
}

async function main() {
  console.log("═══ wines 중복 분석 (name_en 기준) ═══\n");
  const rows = await loadAllWines();
  console.log(`전체 wines: ${rows.length.toLocaleString()}`);

  // 빈 name_en
  const emptyNameEn = rows.filter((r) => !r.name_en || r.name_en.trim() === "");
  console.log(`빈 name_en: ${emptyNameEn.length}건`);

  // 그룹화
  const groups = new Map<string, WineRow[]>();
  for (const r of rows) {
    const key = (r.name_en ?? "").trim();
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const dupGroups = Array.from(groups.entries()).filter(([, arr]) => arr.length > 1);
  const totalExtra = dupGroups.reduce((s, [, arr]) => s + arr.length - 1, 0);

  console.log(`\n중복 그룹: ${dupGroups.length}개`);
  console.log(`삭제될 여분 행: ${totalExtra}개`);
  console.log(`병합 후 wines 건수 예상: ${(rows.length - totalExtra).toLocaleString()}\n`);

  // 각 그룹마다 canonical 선정 + 나머지 = dup
  const mergeMap: Array<{
    canonical_id: string;
    canonical_source: string;
    canonical_name_ko: string;
    dup_ids: string[];
    dup_summary: string;
  }> = [];

  for (const [name_en, arr] of dupGroups) {
    const sorted = [...arr].sort((a, b) => {
      const ra = rankSource(a.source ?? a.data_source);
      const rb = rankSource(b.source ?? b.data_source);
      if (ra !== rb) return ra - rb;
      return a.created_at < b.created_at ? -1 : 1;
    });
    const canonical = sorted[0];
    const dups = sorted.slice(1);
    mergeMap.push({
      canonical_id: canonical.id,
      canonical_source: canonical.source ?? canonical.data_source ?? "?",
      canonical_name_ko: canonical.name_ko,
      dup_ids: dups.map((d) => d.id),
      dup_summary: dups
        .map((d) => `${d.source ?? d.data_source ?? "?"}:${d.name_ko}`)
        .join(" | "),
    });
  }

  // canonical source 분포
  console.log("【canonical source 분포】");
  const canonDist: Record<string, number> = {};
  for (const m of mergeMap) {
    canonDist[m.canonical_source] = (canonDist[m.canonical_source] ?? 0) + 1;
  }
  for (const [s, c] of Object.entries(canonDist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${s.padEnd(18)} ${c}`);
  }

  // 샘플 20개
  console.log("\n【샘플 20그룹】");
  for (const m of mergeMap.slice(0, 20)) {
    console.log(`\n  canonical [${m.canonical_source}] ${m.canonical_name_ko}`);
    console.log(`    dups: ${m.dup_summary}`);
  }

  // 3개 이상 중복인 그룹
  const big = dupGroups.filter(([, arr]) => arr.length >= 3);
  console.log(`\n【3개 이상 중복 그룹: ${big.length}개】`);
  for (const [name_en, arr] of big.slice(0, 20)) {
    const sorted = [...arr].sort((a, b) => rankSource(a.source ?? a.data_source) - rankSource(b.source ?? b.data_source));
    console.log(`  ${name_en} (${arr.length}개)`);
    for (const w of sorted) {
      console.log(`    - [${w.source ?? w.data_source ?? "?"}] ${w.name_ko}`);
    }
  }

  // 결과 저장
  const outPath = "./backup/v3-dup-merge-map.json";
  const fs = await import("fs");
  fs.writeFileSync(outPath, JSON.stringify(mergeMap, null, 2));
  console.log(`\n💾 ${outPath} 저장 (${mergeMap.length} 그룹)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
