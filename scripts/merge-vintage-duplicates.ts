/**
 * wines 내부에서 "빈티지만 다른 중복" 쌍을 찾아 merge
 *
 * 배경:
 *   빈티지 무관 카탈로그 정책이지만, 과거 promote 과정에서 같은 와인이 빈티지 표기만 다르게
 *   여러 wines 레코드로 생성된 경우가 있음 (예: "Chateau X 2020" / "Chateau X 2021" / "Chateau X").
 *   backfill-strip-vintage에서 UNIQUE 충돌로 skip된 케이스가 대표 예.
 *
 * 전략:
 *   1) stripVintage 적용한 name_ko + country 기준으로 그룹핑
 *   2) 크기 ≥ 2 인 그룹을 "중복 후보"로 선정
 *   3) 각 그룹에서 primary 결정 (가장 많이 참조된 rich wines)
 *      기준: source_refs 배열 크기 내림차순 → created_at 오래된 순
 *   4) 다른 레코드(secondary)의 모든 참조를 primary로 이전
 *      - raw_wines.promoted_wine_id (FK 없음, 단순 UUID)
 *      - wine_records.wine_id
 *      - wine_events.wine_id
 *      - wine_wishlist.wine_id
 *      - wine_reports.wine_id
 *      - pending_wines.promoted_wine_id
 *   5) primary에 secondary의 source_refs 추가 + 빈 필드 채우기 + grape_varieties union
 *   6) secondary.is_published = false (hard delete 안 함, 숨김만)
 *   7) secondary의 name_ko/en도 원복: "[merged→primary_id]" prefix로 변경하여 UNIQUE 회피
 *      (name_ko는 NOT NULL + UNIQUE 이므로 건드려야 이후에 동일 빈티지 제거 backfill 가능)
 *
 * 모드:
 *   --dry-run (기본): 후보 그룹 + 샘플만 출력
 *   --apply         : 실제 실행
 *
 * 주의:
 *   같은 이름 + 같은 country라도 실제로 다른 와인인 경우 희귀하게 있을 수 있음 (예: 같은 winery의
 *   다른 블렌드가 같은 이름으로 유통). 이 경우 merge하면 안 되지만 지금 로직은 구분 못 함.
 *   → 그룹 크기가 크거나 producer가 다른 경우 skip하는 안전장치 추가.
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
import { stripVintage } from "../src/lib/wine-dedupe";

config({ path: resolve(process.cwd(), ".env.local") });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const APPLY = process.argv.includes("--apply");

interface WineRow {
  id: string;
  name_ko: string | null;
  name_en: string | null;
  country: string | null;
  country_ko: string | null;
  region: string | null;
  region_ko: string | null;
  producer_ko: string | null;
  producer_en: string | null;
  wine_type: string | null;
  grape_varieties: string[] | null;
  image_url: string | null;
  source_refs: string[] | null;
  created_at: string | null;
  is_published: boolean | null;
}

async function loadAll(): Promise<WineRow[]> {
  const all: WineRow[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb
      .from("wines")
      .select(
        "id, name_ko, name_en, country, country_ko, region, region_ko, producer_ko, producer_en, wine_type, grape_varieties, image_url, source_refs, created_at, is_published",
      )
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as WineRow[]));
    if (data.length < PAGE) break;
    from += data.length;
  }
  return all;
}

function pickPrimary(group: WineRow[]): WineRow {
  return [...group].sort((a, b) => {
    const aRefs = a.source_refs?.length ?? 0;
    const bRefs = b.source_refs?.length ?? 0;
    if (bRefs !== aRefs) return bRefs - aRefs;
    const aT = a.created_at ?? "";
    const bT = b.created_at ?? "";
    return aT.localeCompare(bT);
  })[0];
}

async function applyMerge(primary: WineRow, secondaries: WineRow[]): Promise<{ ok: boolean; err?: string; stats: Record<string, number> }> {
  const now = new Date().toISOString();
  const stats = {
    raw_wines: 0,
    wine_records: 0,
    wine_events: 0,
    wine_wishlist: 0,
    wine_reports: 0,
    pending_wines: 0,
  };

  for (const sec of secondaries) {
    // 참조 재지정
    const refTables: Array<{ table: string; col: string; stat: keyof typeof stats }> = [
      { table: "raw_wines", col: "promoted_wine_id", stat: "raw_wines" },
      { table: "wine_records", col: "wine_id", stat: "wine_records" },
      { table: "wine_events", col: "wine_id", stat: "wine_events" },
      { table: "wine_wishlist", col: "wine_id", stat: "wine_wishlist" },
      { table: "wine_reports", col: "wine_id", stat: "wine_reports" },
      { table: "pending_wines", col: "promoted_wine_id", stat: "pending_wines" },
    ];
    for (const r of refTables) {
      const { count } = await sb.from(r.table).select("id", { count: "exact", head: true }).eq(r.col, sec.id);
      if (count && count > 0) {
        const upd = await sb.from(r.table).update({ [r.col]: primary.id }).eq(r.col, sec.id);
        if (upd.error) return { ok: false, err: `${r.table}.${r.col} update 실패: ${upd.error.message}`, stats };
        stats[r.stat] += count;
      }
    }

    // primary에 secondary의 source_refs + 빈 필드 보강
    const primaryRefs = Array.isArray(primary.source_refs) ? primary.source_refs : [];
    const secRefs = Array.isArray(sec.source_refs) ? sec.source_refs : [];
    const mergedRefs = Array.from(new Set([...primaryRefs, ...secRefs]));

    const primaryGrapes = Array.isArray(primary.grape_varieties) ? primary.grape_varieties : [];
    const secGrapes = Array.isArray(sec.grape_varieties) ? sec.grape_varieties : [];
    const mergedGrapes = Array.from(new Set([...primaryGrapes, ...secGrapes].map((g) => g.trim()).filter(Boolean)));

    const primaryUpdates: Record<string, unknown> = { updated_at: now };
    const fillEmpty = (k: keyof WineRow, v: unknown) => {
      if (v == null || v === "") return;
      const cur = primary[k];
      if (cur == null || cur === "") primaryUpdates[k as string] = v;
    };
    fillEmpty("name_en", sec.name_en);
    fillEmpty("country", sec.country);
    fillEmpty("country_ko", sec.country_ko);
    fillEmpty("region", sec.region);
    fillEmpty("region_ko", sec.region_ko);
    fillEmpty("producer_ko", sec.producer_ko);
    fillEmpty("producer_en", sec.producer_en);
    fillEmpty("wine_type", sec.wine_type);
    fillEmpty("image_url", sec.image_url);

    if (mergedRefs.length > primaryRefs.length) primaryUpdates.source_refs = mergedRefs;
    if (mergedGrapes.length > primaryGrapes.length) primaryUpdates.grape_varieties = mergedGrapes;

    if (Object.keys(primaryUpdates).length > 1) {
      const upd = await sb.from("wines").update(primaryUpdates).eq("id", primary.id);
      if (upd.error) return { ok: false, err: `primary update 실패: ${upd.error.message}`, stats };
      // primary 로컬 상태도 동기화 (뒤 secondary 처리에 반영)
      if (primaryUpdates.source_refs) primary.source_refs = mergedRefs;
      if (primaryUpdates.grape_varieties) primary.grape_varieties = mergedGrapes;
    }

    // secondary: is_published=false + name_ko/en을 merged 표식으로 변경 (UNIQUE 충돌 회피)
    const mergedTag = `[merged→${primary.id.slice(0, 8)}]`;
    const secUpdates: Record<string, unknown> = {
      is_published: false,
      updated_at: now,
      name_ko: `${mergedTag} ${sec.name_ko ?? sec.id}`,
    };
    if (sec.name_en) secUpdates.name_en = `${mergedTag} ${sec.name_en}`;
    const secUpd = await sb.from("wines").update(secUpdates).eq("id", sec.id);
    if (secUpd.error) return { ok: false, err: `secondary update 실패 (${sec.id}): ${secUpd.error.message}`, stats };
  }

  return { ok: true, stats };
}

async function main() {
  console.log(`=== merge-vintage-duplicates ${APPLY ? "[APPLY]" : "[DRY-RUN]"} ===\n`);

  const all = await loadAll();
  const published = all.filter((w) => w.is_published !== false);
  console.log(`wines: 전체 ${all.length.toLocaleString()}, is_published=true ${published.length.toLocaleString()}\n`);

  // 그룹핑 키: stripVintage(name_ko) + country_ko/country (둘 중 하나)
  const groups = new Map<string, WineRow[]>();
  for (const w of published) {
    if (!w.name_ko) continue;
    const nameKey = stripVintage(w.name_ko).trim();
    if (!nameKey) continue;
    const countryKey = (w.country_ko ?? w.country ?? "").trim();
    const key = `${nameKey}||${countryKey}`;
    const arr = groups.get(key) ?? [];
    arr.push(w);
    groups.set(key, arr);
  }

  const dupGroups = [...groups.values()].filter((g) => g.length >= 2);
  console.log(`중복 후보 그룹: ${dupGroups.length}개 (총 wines ${dupGroups.reduce((s, g) => s + g.length, 0)}건)`);

  // 안전 가드: 그룹 크기 > 5 또는 producer가 그룹 내 다양하게 다르면 skip (수동 처리)
  const safeGroups: WineRow[][] = [];
  const suspiciousGroups: WineRow[][] = [];
  for (const g of dupGroups) {
    if (g.length > 5) {
      suspiciousGroups.push(g);
      continue;
    }
    // producer 일관성 체크
    const producers = new Set<string>();
    for (const w of g) {
      const p = (w.producer_ko ?? w.producer_en ?? "").trim().toLowerCase();
      if (p) producers.add(p);
    }
    // 2가지 이상이면 의심 (1가지거나 전부 비어있으면 OK)
    if (producers.size >= 2) {
      suspiciousGroups.push(g);
    } else {
      safeGroups.push(g);
    }
  }

  console.log(`  자동 merge 대상:  ${safeGroups.length}개 그룹 (wines ${safeGroups.reduce((s, g) => s + g.length, 0)}건)`);
  console.log(`  수동 검토 필요:   ${suspiciousGroups.length}개 그룹 (producer 불일치 또는 그룹 크기 >5)\n`);

  console.log("━━ 자동 merge 샘플 (최대 15 그룹) ━━");
  for (const g of safeGroups.slice(0, 15)) {
    const primary = pickPrimary(g);
    console.log(`\n  [key: ${stripVintage(g[0].name_ko ?? "")} / ${g[0].country_ko ?? g[0].country}]`);
    for (const w of g) {
      const tag = w.id === primary.id ? "★ primary" : "  merge→";
      console.log(`    ${tag} ${w.name_ko} (refs=${w.source_refs?.length ?? 0})`);
    }
  }

  if (suspiciousGroups.length > 0) {
    console.log("\n━━ 수동 검토 샘플 (최대 5 그룹) ━━");
    for (const g of suspiciousGroups.slice(0, 5)) {
      console.log(`\n  [key: ${stripVintage(g[0].name_ko ?? "")}]`);
      for (const w of g) {
        console.log(`    ${w.name_ko} | producer=${w.producer_ko ?? w.producer_en ?? "-"}`);
      }
    }
  }

  if (!APPLY) {
    console.log("\n※ DRY-RUN 종료. 실행하려면 --apply");
    return;
  }

  // 실제 실행
  console.log("\n=== MERGE 실행 ===");
  let mergedGroups = 0;
  let mergedSecondaries = 0;
  const aggStats = { raw_wines: 0, wine_records: 0, wine_events: 0, wine_wishlist: 0, wine_reports: 0, pending_wines: 0 };
  let errors = 0;

  for (const g of safeGroups) {
    const primary = pickPrimary(g);
    const secondaries = g.filter((w) => w.id !== primary.id);
    const result = await applyMerge(primary, secondaries);
    if (!result.ok) {
      errors++;
      console.error(`  [err] primary=${primary.id.slice(0, 8)}: ${result.err}`);
      continue;
    }
    mergedGroups++;
    mergedSecondaries += secondaries.length;
    for (const k of Object.keys(aggStats) as Array<keyof typeof aggStats>) aggStats[k] += result.stats[k];
    if (mergedGroups % 5 === 0) {
      process.stdout.write(`\r  진행 ${mergedGroups}/${safeGroups.length} 그룹`);
    }
  }
  console.log();
  console.log(`\n완료:`);
  console.log(`  merged groups:         ${mergedGroups}`);
  console.log(`  hidden secondaries:    ${mergedSecondaries}`);
  console.log(`  재지정 참조:`);
  for (const [k, v] of Object.entries(aggStats)) console.log(`    ${k}: ${v}`);
  console.log(`  errors: ${errors}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
