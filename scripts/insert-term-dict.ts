/**
 * Phase 1 Step 5: 번역 결과를 term_dict에 INSERT
 *
 * 실행:
 *   NODE_ENV=development npx tsx scripts/insert-term-dict.ts --dry-run
 *   NODE_ENV=development npx tsx scripts/insert-term-dict.ts
 *
 * 입력: backup/v3-phase1-translated-<ts>.json (최신 파일 자동 선택)
 * 동작:
 *   - skip=true 또는 en/ko 빈 문자열 제외
 *   - (category, en) 유니크 충돌 시 ON CONFLICT DO UPDATE — 기존 verified=true는 보존
 *   - upsert 배치 크기 500건
 *
 * 출력:
 *   - 카테고리별 INSERT/UPDATE 건수
 *   - skip/empty 건수 (backup으로 별도 JSON 저장)
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const BATCH_SIZE = 500;

interface T {
  category: string;
  input: string;
  en: string;
  ko: string;
  aliases: string[];
  skip?: boolean;
}

function findLatestFile(prefix: string): string {
  const dir = path.join(process.cwd(), "backup");
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(prefix));
  files.sort().reverse();
  return path.join(dir, files[0]);
}

async function main() {
  const file = findLatestFile("v3-phase1-translated-");
  console.log(`📥 입력: ${file}`);

  const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
  const all: T[] = raw.translations;

  // 유효 번역만 필터
  const valid = all.filter((t) => !t.skip && t.en && t.ko);
  const invalid = all.filter((t) => t.skip || !t.en || !t.ko);

  console.log(`\n📊 입력 번역:`);
  console.log(`  전체:        ${all.length.toLocaleString()}`);
  console.log(`  유효 (INSERT): ${valid.length.toLocaleString()}`);
  console.log(`  제외 (skip/empty): ${invalid.length.toLocaleString()}`);

  // (category, en) 기준 그룹화 — 중복 input을 aliases에 병합
  const grouped = new Map<string, { head: T; extraInputs: string[]; extraAliases: string[] }>();
  let dupesCount = 0;
  for (const t of valid) {
    const key = `${t.category}::${t.en.trim().toLowerCase()}`;
    const g = grouped.get(key);
    if (!g) {
      grouped.set(key, { head: t, extraInputs: [], extraAliases: [] });
    } else {
      dupesCount++;
      // 중복 input의 ko 및 aliases를 병합 후보로 축적
      if (t.input && t.input !== g.head.input && t.input !== g.head.ko) {
        g.extraInputs.push(t.input);
      }
      if (t.ko && t.ko !== g.head.ko) {
        g.extraInputs.push(t.ko); // 다른 ko 표기도 alias로
      }
      g.extraAliases.push(...(t.aliases ?? []));
    }
  }
  if (dupesCount > 0) {
    console.log(`  중복 (category,en): ${dupesCount}건 → head 유지 + input/aliases를 aliases에 병합`);
  }

  const unique: T[] = Array.from(grouped.values()).map((g) => {
    // 병합된 aliases: 기존 + extraInputs + extraAliases, 중복 제거, 정규화
    const combined = new Set<string>();
    for (const a of [...(g.head.aliases ?? []), ...g.extraInputs, ...g.extraAliases]) {
      if (!a || typeof a !== "string") continue;
      const cleaned = a.trim();
      if (!cleaned) continue;
      if (cleaned === g.head.en.trim()) continue;
      if (cleaned === g.head.ko.trim()) continue;
      combined.add(cleaned);
    }
    return {
      ...g.head,
      aliases: Array.from(combined),
    };
  });

  // 카테고리별 집계
  const catStats: Record<string, number> = {};
  for (const t of unique) catStats[t.category] = (catStats[t.category] ?? 0) + 1;
  console.log("\n  카테고리별 유효 건수:");
  for (const [c, n] of Object.entries(catStats)) {
    console.log(`    ${c.padEnd(8)} ${n.toLocaleString()}`);
  }

  // upsert payload 구성
  const rows = unique.map((t) => ({
    category: t.category,
    en: t.en.trim(),
    ko: t.ko.trim(),
    aliases: (t.aliases ?? []).filter((a) => a && typeof a === "string" && a.trim().length > 0),
    verified: false,
    source: "llm_initial",
  }));

  if (DRY_RUN) {
    console.log(`\n🔍 dry-run — INSERT 안 함`);
    console.log(`첫 5건 샘플:`);
    for (const r of rows.slice(0, 5)) {
      console.log(`  ${JSON.stringify(r)}`);
    }
    return;
  }

  // 실 INSERT (upsert, ON CONFLICT 기준 PRIMARY KEY (category, en))
  console.log(`\n💾 INSERT 시작 — ${rows.length.toLocaleString()}건 / 배치 ${BATCH_SIZE}`);
  let inserted = 0;
  let errored = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await sb
      .from("term_dict")
      .upsert(batch, { onConflict: "category,en", ignoreDuplicates: false });

    if (error) {
      errored += batch.length;
      console.error(`  ❌ 배치 ${i / BATCH_SIZE + 1} 실패: ${JSON.stringify(error)}`);
      console.error(`     첫 행: ${JSON.stringify(batch[0])}`);
      break; // 오류 시 중단
    }
    inserted += batch.length;
    process.stdout.write(`\r  진행: ${inserted.toLocaleString()} / ${rows.length.toLocaleString()}  `);
  }
  process.stdout.write("\n");

  // 검증
  const { count: finalCount } = await sb.from("term_dict").select("*", { count: "exact", head: true });
  console.log(`\n✅ INSERT 완료: ${inserted.toLocaleString()} 성공, ${errored.toLocaleString()} 실패`);
  console.log(`   term_dict 총 행 수: ${(finalCount ?? 0).toLocaleString()}`);

  // 스킵된 용어 저장
  if (invalid.length > 0) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const skippedPath = path.join(process.cwd(), "backup", `v3-phase1-skipped-${ts}.json`);
    fs.writeFileSync(
      skippedPath,
      JSON.stringify({ timestamp: new Date().toISOString(), skipped: invalid }, null, 2),
    );
    console.log(`📁 스킵 용어 ${invalid.length}건 저장: ${skippedPath}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
