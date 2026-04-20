/**
 * winery_en 오염 패턴 스캔
 *
 * 탐지 카테고리:
 *   1. 대괄호/괄호/중괄호 메타: [B2B], (수입사), {...}
 *   2. 법인 suffix: Group, INC, Corp, LLC, Ltd, Co., 그룹 등
 *   3. 이중 공백 / 과다 특수문자
 *   4. 한글 혼재 (winery_en인데 한글 섞임)
 *   5. 오타 의심 — 주요 와이너리 어휘와 DL 거리 1~2
 *   6. 빈 문자열 / 너무 짧음
 *
 * 모든 패턴 read-only. 결과만 출력.
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// ─── Damerau-Levenshtein ───────────────────────────────────────────────────
function dlDistance(a: string, b: string): number {
  const al = a.length, bl = b.length;
  if (!al) return bl;
  if (!bl) return al;
  const d: number[][] = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) d[i][0] = i;
  for (let j = 0; j <= bl; j++) d[0][j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[al][bl];
}

// ─── 카테고리별 패턴 ──────────────────────────────────────────────────────

const CANONICAL_WORDS = [
  "chateau","domaine","maison","bodegas","bodega","castello","tenuta","cantina",
  "weingut","azienda","agricola","quinta","winery","vineyards","vineyard","cellars",
  "cellar","estate","estates","bodega","champagne",
];

const CORP_SUFFIX_RE = /\b(group|inc\.?|corp\.?|corporation|llc|ltd\.?|co\.?|company|holdings|그룹|홀딩스)\s*$/i;
const BRACKET_RE = /[\[\(\{][^\]\)\}]+[\]\)\}]/;
const KOREAN_RE = /[\uac00-\ud7a3]/;
const MULTISPACE_RE = /\s{2,}/;
const WEIRD_CHARS_RE = /[^\w\s\-'.,&/À-ÿ]/;

function findTypoSuspects(winery: string): string[] {
  const tokens = winery.toLowerCase().split(/\s+/).filter((t) => t.length >= 4);
  const suspects: string[] = [];
  for (const t of tokens) {
    const clean = t.replace(/[^a-zàâçéèêëîïôûùüÿñæœ]/g, "");
    if (clean.length < 4) continue;
    for (const canon of CANONICAL_WORDS) {
      if (clean === canon) break; // 정확 일치 → 나머지 canonical 확인할 필요 없음
      const d = dlDistance(clean, canon);
      if (d === 1 || (d === 2 && canon.length >= 7)) {
        suspects.push(`"${t}"→"${canon}"(d=${d})`);
        break;
      }
    }
  }
  return suspects;
}

// ─── 메인 ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍 winery_en 오염 스캔\n");

  // 페이지네이션으로 전체 로드 (distinct winery_en)
  const all: string[] = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb.from("raw_wines")
      .select("raw_payload")
      .eq("source", "wine21")
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      const w = (r.raw_payload as Record<string, unknown>)?.winery_en as string | undefined;
      if (w) all.push(w);
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  const total = all.length;
  const unique = Array.from(new Set(all));
  console.log(`  winery_en 보유 row: ${total}`);
  console.log(`  unique 와이너리: ${unique.length}\n`);

  // 카테고리별 집계
  const cat = {
    bracket: [] as string[],
    corpSuffix: [] as string[],
    korean: [] as string[],
    multiSpace: [] as string[],
    weirdChars: [] as string[],
    tooShort: [] as string[],
    typo: [] as Array<{ winery: string; suspects: string[] }>,
  };

  for (const w of unique) {
    if (BRACKET_RE.test(w)) cat.bracket.push(w);
    if (CORP_SUFFIX_RE.test(w)) cat.corpSuffix.push(w);
    if (KOREAN_RE.test(w)) cat.korean.push(w);
    if (MULTISPACE_RE.test(w)) cat.multiSpace.push(w);
    if (WEIRD_CHARS_RE.test(w)) cat.weirdChars.push(w);
    if (w.trim().length < 3) cat.tooShort.push(w);
    const typos = findTypoSuspects(w);
    if (typos.length) cat.typo.push({ winery: w, suspects: typos });
  }

  // 출현 빈도 집계 (각 unique winery가 raw_wines에서 몇 건 쓰이는지)
  const freq = new Map<string, number>();
  for (const w of all) freq.set(w, (freq.get(w) ?? 0) + 1);

  const section = (title: string, items: string[], sampleN = 10) => {
    console.log(`=== ${title} (${items.length}) ===`);
    items
      .sort((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0))
      .slice(0, sampleN)
      .forEach((w) => console.log(`  [${freq.get(w) ?? 0}건]  "${w}"`));
    console.log();
  };

  section("1. 대괄호/괄호/중괄호 메타", cat.bracket, 15);
  section("2. 법인 suffix (Group/Inc/Corp/LLC/Ltd 등)", cat.corpSuffix, 15);
  section("3. 한글 혼재", cat.korean, 10);
  section("4. 이중 공백", cat.multiSpace, 5);
  section("5. 특수문자 과다", cat.weirdChars, 10);
  section("6. 너무 짧음 (<3자)", cat.tooShort, 5);

  console.log(`=== 7. 오타 의심 (${cat.typo.length}) ===`);
  cat.typo
    .sort((a, b) => (freq.get(b.winery) ?? 0) - (freq.get(a.winery) ?? 0))
    .slice(0, 20)
    .forEach((e) => console.log(`  [${freq.get(e.winery) ?? 0}건]  "${e.winery}"  ${e.suspects.join(", ")}`));
  console.log();

  // 요약
  const totalDirty = new Set([
    ...cat.bracket, ...cat.corpSuffix, ...cat.korean, ...cat.multiSpace,
    ...cat.weirdChars, ...cat.tooShort, ...cat.typo.map((e) => e.winery),
  ]);
  const dirtyRowCount = all.filter((w) => totalDirty.has(w)).length;
  console.log(`========= 요약 =========`);
  console.log(`오염 의심 unique winery: ${totalDirty.size} / ${unique.length} (${((totalDirty.size / unique.length) * 100).toFixed(1)}%)`);
  console.log(`영향받는 row: ${dirtyRowCount} / ${total} (${((dirtyRowCount / total) * 100).toFixed(1)}%)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
