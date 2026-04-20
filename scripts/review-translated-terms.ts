/**
 * Phase 1 Step 4: 번역 결과 품질 검토 (READ-ONLY)
 *
 * 실행: NODE_ENV=development npx tsx scripts/review-translated-terms.ts
 *
 * 확인:
 *   - 카테고리별 번역 성공/스킵 건수
 *   - 동일 input이 중복된 케이스
 *   - en 또는 ko가 빈 문자열인 케이스 (실패)
 *   - 샘플 10건씩 출력 (수동 검증용)
 *   - skip=true로 플래그된 용어들
 */
import fs from "fs";
import path from "path";

function findLatestFile(prefix: string): string {
  const dir = path.join(process.cwd(), "backup");
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(prefix));
  files.sort().reverse();
  return path.join(dir, files[0]);
}

interface T {
  category: string;
  input: string;
  en: string;
  ko: string;
  aliases: string[];
  skip?: boolean;
}

function main() {
  const file = findLatestFile("v3-phase1-translated-");
  console.log(`📂 ${file}\n`);

  const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
  const all: T[] = raw.translations;

  console.log("═══ 번역 결과 요약 ═══");
  console.log(`총 건수: ${all.length.toLocaleString()}`);
  console.log(`비용: $${(
    raw.stats.cost_estimate_usd.input +
    raw.stats.cost_estimate_usd.output +
    raw.stats.cost_estimate_usd.cache_creation +
    raw.stats.cost_estimate_usd.cache_read
  ).toFixed(4)}`);
  console.log(`토큰: input=${raw.stats.tokens.input.toLocaleString()}  output=${raw.stats.tokens.output.toLocaleString()}`);

  // 카테고리별
  const byCat: Record<string, T[]> = {};
  for (const t of all) {
    if (!byCat[t.category]) byCat[t.category] = [];
    byCat[t.category].push(t);
  }

  console.log("\n═══ 카테고리별 ═══");
  for (const cat of ["country", "region", "grape", "style"]) {
    const list = byCat[cat] ?? [];
    const skipped = list.filter((t) => t.skip).length;
    const empty = list.filter((t) => !t.skip && (!t.en || !t.ko)).length;
    const good = list.length - skipped - empty;
    console.log(`  ${cat.padEnd(8)}  전체:${String(list.length).padStart(5)}  OK:${String(good).padStart(5)}  skip:${String(skipped).padStart(4)}  empty:${String(empty).padStart(4)}`);
  }

  // 중복 input 확인
  console.log("\n═══ 중복 input ═══");
  const inputSeen = new Map<string, T[]>();
  for (const t of all) {
    const key = `${t.category}::${t.input}`;
    if (!inputSeen.has(key)) inputSeen.set(key, []);
    inputSeen.get(key)!.push(t);
  }
  const dupes = Array.from(inputSeen.entries()).filter(([, arr]) => arr.length > 1);
  console.log(`  중복 ${dupes.length}건`);
  for (const [key, arr] of dupes.slice(0, 5)) {
    console.log(`    ${key} (${arr.length}회)`);
  }

  // 샘플 10건씩
  console.log("\n═══ 샘플 (카테고리별 10건) ═══");
  for (const cat of ["country", "region", "grape", "style"]) {
    const list = (byCat[cat] ?? []).filter((t) => !t.skip && t.en && t.ko);
    console.log(`\n[${cat}]`);
    for (const t of list.slice(0, 10)) {
      const aliasStr = t.aliases.length > 0 ? `  (aliases: ${t.aliases.slice(0, 3).join(", ")})` : "";
      console.log(`  ${t.input.padEnd(30)} en: ${t.en.padEnd(30)} ko: ${t.ko}${aliasStr}`);
    }
  }

  // skip 플래그된 것들
  const skipped = all.filter((t) => t.skip);
  if (skipped.length > 0) {
    console.log(`\n═══ skip=true (${skipped.length}건) ═══`);
    for (const t of skipped.slice(0, 20)) {
      console.log(`  [${t.category}] ${t.input}  reason: ${t.aliases[0] ?? ""}`);
    }
  }

  // en/ko 빈 문자열
  const empty = all.filter((t) => !t.skip && (!t.en || !t.ko));
  if (empty.length > 0) {
    console.log(`\n═══ empty en/ko (${empty.length}건) ═══`);
    for (const t of empty.slice(0, 20)) {
      console.log(`  [${t.category}] input=${t.input}  en="${t.en}"  ko="${t.ko}"`);
    }
  }
}

main();
