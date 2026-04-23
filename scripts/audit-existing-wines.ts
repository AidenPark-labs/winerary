/**
 * audit-existing-wines: wines 전체에 대한 감사 (읽기 전용)
 *
 * 목적:
 *   - 새 promote 정책 기준(name_ko + name_en + country + grape)을 기존 레코드가 충족하는지
 *   - 필드별 결손 집계
 *   - Vivino 검수 상태 분포
 *   - is_published / source 분포
 *
 * 이 스크립트는 절대 UPDATE/INSERT/DELETE를 하지 않는다. 측정 전용.
 * 미달 건을 어떻게 처리할지(예: is_published=false로 내릴지)는 측정 결과를 본 후 별도 결정.
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

interface WineRow {
  id: string;
  name_ko: string | null;
  name_en: string | null;
  country: string | null;
  country_ko: string | null;
  grape_varieties: string[] | null;
  grape_variety: string | null;
  is_published: boolean | null;
  vivino_url: string | null;
  vivino_needs_review: boolean | null;
  vivino_reviewed_at: string | null;
  source: string | null;
  data_source: string | null;
  producer_ko: string | null;
  producer_en: string | null;
  winery_en_clean: string | null;
}

async function main() {
  console.log("wines 전체 감사...\n");

  const all: WineRow[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data } = await sb
      .from("wines")
      .select(
        "id, name_ko, name_en, country, country_ko, grape_varieties, grape_variety, is_published, vivino_url, vivino_needs_review, vivino_reviewed_at, source, data_source, producer_ko, producer_en, winery_en_clean",
      )
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    all.push(...(data as WineRow[]));
    if (data.length < PAGE) break;
    from += data.length;
  }
  console.log(`총 wines: ${all.length.toLocaleString()}\n`);

  // ── 새 4필드 기준 준수 여부 ───────────────────────────────────
  let pass4 = 0;
  const missing = { name_ko: 0, name_en: 0, country: 0, grape: 0 };
  for (const w of all) {
    const mk = [];
    if (!w.name_ko?.trim()) mk.push("name_ko");
    if (!w.name_en?.trim()) mk.push("name_en");
    if (!w.country?.trim()) mk.push("country");
    const hasGrape = (Array.isArray(w.grape_varieties) && w.grape_varieties.length > 0) || !!w.grape_variety?.trim();
    if (!hasGrape) mk.push("grape");
    if (mk.length === 0) pass4++;
    for (const k of mk) (missing as Record<string, number>)[k]++;
  }
  const fail4 = all.length - pass4;
  console.log("━━ 새 4필드 기준 ━━");
  console.log(`  통과 (모두 채워짐): ${pass4.toLocaleString()} (${((pass4 / all.length) * 100).toFixed(1)}%)`);
  console.log(`  실패: ${fail4.toLocaleString()} (${((fail4 / all.length) * 100).toFixed(1)}%)`);
  console.log(`    · name_ko 누락: ${missing.name_ko}`);
  console.log(`    · name_en 누락: ${missing.name_en}`);
  console.log(`    · country 누락: ${missing.country}`);
  console.log(`    · grape 누락:   ${missing.grape}`);

  // ── winery 분포 (선택) ────────────────────────────────────────
  let hasWinery = 0;
  for (const w of all) {
    if (w.producer_ko?.trim() || w.producer_en?.trim() || w.winery_en_clean?.trim()) hasWinery++;
  }
  console.log(`\n━━ winery (선택) ━━`);
  console.log(`  producer_ko|en|winery_en_clean 中 하나라도 있음: ${hasWinery.toLocaleString()} (${((hasWinery / all.length) * 100).toFixed(1)}%)`);

  // ── Vivino 상태 ───────────────────────────────────────────────
  let viv_url = 0, viv_none = 0, viv_reviewed = 0, viv_needs_review = 0, viv_unreviewed = 0;
  for (const w of all) {
    if (w.vivino_url) {
      viv_url++;
      if (w.vivino_reviewed_at) viv_reviewed++;
      else if (w.vivino_needs_review) viv_needs_review++;
      else viv_unreviewed++;
    } else {
      viv_none++;
    }
  }
  console.log(`\n━━ Vivino 상태 ━━`);
  console.log(`  vivino_url 없음: ${viv_none.toLocaleString()}`);
  console.log(`  vivino_url 있음: ${viv_url.toLocaleString()}`);
  console.log(`    · reviewed_at 찍힘 (노출):      ${viv_reviewed.toLocaleString()}`);
  console.log(`    · needs_review=true (비노출):   ${viv_needs_review.toLocaleString()}`);
  console.log(`    · 검수 안 됨 (reviewed_at null + needs_review false): ${viv_unreviewed.toLocaleString()}`);

  // ── is_published ──────────────────────────────────────────────
  const pub = all.filter((w) => w.is_published === true).length;
  const unpub = all.filter((w) => w.is_published === false).length;
  console.log(`\n━━ is_published ━━`);
  console.log(`  true (노출):   ${pub.toLocaleString()}`);
  console.log(`  false (숨김):  ${unpub.toLocaleString()}`);

  // ── source 분포 ───────────────────────────────────────────────
  const srcCount: Record<string, number> = {};
  for (const w of all) {
    const s = w.source ?? w.data_source ?? "(null)";
    srcCount[s] = (srcCount[s] ?? 0) + 1;
  }
  console.log(`\n━━ source 분포 ━━`);
  for (const [s, c] of Object.entries(srcCount).sort(([, a], [, b]) => b - a)) {
    console.log(`  ${s}: ${c.toLocaleString()}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
