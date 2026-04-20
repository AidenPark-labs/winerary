/**
 * grape 컬럼에 비율 포함 문자열이 들어간 케이스 심층 분석 (READ-ONLY)
 *
 * 실행: NODE_ENV=development npx tsx scripts/investigate-grape-pollution.ts
 *
 * 조사 내용:
 *   1. 번역 결과 중 "비율 포함" grape 추출 (패턴: \d+%)
 *   2. 각 문자열이 실제 DB 어느 필드에 있는지 추적
 *      - wines.grape_variety
 *      - raw_wines.grape_variety
 *      - raw_wines.raw_payload.vivino_grapes
 *      - raw_wines.raw_payload.parsed_grape_varieties[]
 *   3. 예시 wine(name_ko, name_en, source) 함께 출력
 *   4. empty로 판정된 grape 전체 목록
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

const PAGE = 1000;

// 비율 포함 패턴 감지
function hasPercentage(s: string): boolean {
  return /\d+\s*%/.test(s);
}

function findLatestFile(prefix: string): string {
  const dir = path.join(process.cwd(), "backup");
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(prefix));
  files.sort().reverse();
  return path.join(dir, files[0]);
}

async function main() {
  // ─── 1. 번역 결과에서 비율 포함 grape 추출 ───
  const transFile = findLatestFile("v3-phase1-translated-");
  const trans = JSON.parse(fs.readFileSync(transFile, "utf-8"));
  const translations = trans.translations as Array<{
    category: string;
    input: string;
    en: string;
    ko: string;
    skip?: boolean;
  }>;

  const grapeEmpty = translations.filter((t) => t.category === "grape" && !t.skip && (!t.en || !t.ko));
  const grapePercentage = translations.filter((t) => t.category === "grape" && hasPercentage(t.input));
  const grapeAllPolluted = Array.from(new Set([...grapeEmpty, ...grapePercentage]));

  console.log("═══════════════════════════════════════════════════");
  console.log("  grape 컬럼 데이터 오염 분석");
  console.log("═══════════════════════════════════════════════════\n");

  console.log(`번역 empty grape:        ${grapeEmpty.length}건`);
  console.log(`비율(%) 포함 grape:      ${grapePercentage.length}건`);
  console.log(`병합 후 조사 대상:       ${grapeAllPolluted.length}건\n`);

  console.log("─── 비율 포함 grape 전체 목록 ───");
  for (const t of grapePercentage.sort((a, b) => a.input.localeCompare(b.input))) {
    const status = t.skip ? "skip" : (!t.en || !t.ko) ? "empty" : "OK";
    console.log(`  [${status.padEnd(5)}] ${t.input}`);
  }

  // ─── 2. 비율 포함 문자열을 DB에서 역추적 ───
  console.log("\n═══ DB에서 비율 포함 문자열 역추적 ═══");

  const suspects = grapeAllPolluted.map((t) => t.input);
  console.log(`조사 대상 문자열 ${suspects.length}개\n`);

  // a) wines.grape_variety 에서 검색 (쉼표로 쪼개져 있을 수 있음)
  console.log("[a] wines.grape_variety 에서 매칭 추적");
  const winesByVariety = new Map<string, Array<{ id: string; name_ko: string; name_en: string; source: string; raw: string }>>();

  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from("wines")
      .select("id, name_ko, name_en, data_source, grape_variety")
      .not("grape_variety", "is", null)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const w of data) {
      const raw = w.grape_variety as string;
      if (!hasPercentage(raw)) continue;

      // 이 행의 grape_variety에 어떤 suspects가 포함됐는지
      for (const s of suspects) {
        if (raw.includes(s)) {
          if (!winesByVariety.has(s)) winesByVariety.set(s, []);
          winesByVariety.get(s)!.push({
            id: w.id as string,
            name_ko: w.name_ko as string,
            name_en: w.name_en as string,
            source: w.data_source as string,
            raw,
          });
        }
      }
    }
    if (data.length < PAGE) break;
    offset += data.length;
  }

  if (winesByVariety.size > 0) {
    console.log(`  wines.grape_variety에서 발견: ${winesByVariety.size}종류`);
    for (const [s, arr] of Array.from(winesByVariety.entries()).slice(0, 15)) {
      console.log(`\n  "${s}" → ${arr.length}개 wines`);
      for (const w of arr.slice(0, 2)) {
        console.log(`    · [${w.source}] ${w.name_ko} / ${w.name_en}`);
        console.log(`      grape_variety 원문: ${w.raw.slice(0, 160)}${w.raw.length > 160 ? "..." : ""}`);
      }
    }
  } else {
    console.log("  wines.grape_variety에서 발견 없음");
  }

  // b) raw_wines 에서 검색
  console.log("\n[b] raw_wines (grape_variety + raw_payload) 에서 매칭 추적");
  const rawBySuspect = new Map<string, Array<{
    id: string;
    name_ko: string;
    name_en: string;
    source: string;
    via: "grape_variety" | "vivino_grapes" | "parsed_grape_varieties";
    raw: string;
  }>>();

  offset = 0;
  while (true) {
    const { data, error } = await sb
      .from("raw_wines")
      .select("id, name_ko, name_en, source, grape_variety, raw_payload")
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const r of data) {
      const payload = r.raw_payload as Record<string, unknown> | null;
      const srcs = [
        { field: "grape_variety" as const, val: r.grape_variety as string | null },
        { field: "vivino_grapes" as const, val: (payload?.vivino_grapes as string | null) ?? null },
      ];

      for (const { field, val } of srcs) {
        if (!val) continue;
        if (!hasPercentage(val)) continue;
        for (const s of suspects) {
          if (val.includes(s)) {
            if (!rawBySuspect.has(s)) rawBySuspect.set(s, []);
            rawBySuspect.get(s)!.push({
              id: r.id as string,
              name_ko: r.name_ko as string,
              name_en: r.name_en as string,
              source: r.source as string,
              via: field === "grape_variety" ? "grape_variety" : "vivino_grapes",
              raw: val,
            });
          }
        }
      }

      // parsed_grape_varieties 배열 내부도 체크
      const parsed = payload?.parsed_grape_varieties;
      if (Array.isArray(parsed)) {
        for (const g of parsed) {
          if (typeof g !== "string") continue;
          if (!hasPercentage(g)) continue;
          for (const s of suspects) {
            if (g.includes(s) || g === s) {
              if (!rawBySuspect.has(s)) rawBySuspect.set(s, []);
              rawBySuspect.get(s)!.push({
                id: r.id as string,
                name_ko: r.name_ko as string,
                name_en: r.name_en as string,
                source: r.source as string,
                via: "parsed_grape_varieties",
                raw: parsed.join(", "),
              });
            }
          }
        }
      }
    }
    if (data.length < PAGE) break;
    offset += data.length;
  }

  if (rawBySuspect.size > 0) {
    console.log(`  raw_wines에서 발견: ${rawBySuspect.size}종류`);
    // 경로(via)별 집계
    const viaCount: Record<string, number> = {};
    for (const arr of rawBySuspect.values()) {
      for (const w of arr) {
        viaCount[w.via] = (viaCount[w.via] ?? 0) + 1;
      }
    }
    console.log(`  경로별 건수:`);
    for (const [via, c] of Object.entries(viaCount)) {
      console.log(`    ${via.padEnd(25)} ${c}`);
    }

    console.log(`\n  상세 샘플 (상위 10종류):`);
    for (const [s, arr] of Array.from(rawBySuspect.entries()).slice(0, 10)) {
      console.log(`\n  "${s}" → ${arr.length}회 출현`);
      for (const w of arr.slice(0, 2)) {
        console.log(`    · [${w.source}] via ${w.via}: ${w.name_ko} / ${w.name_en}`);
        console.log(`      원문: ${w.raw.slice(0, 180)}${w.raw.length > 180 ? "..." : ""}`);
      }
    }
  } else {
    console.log("  raw_wines에서 발견 없음");
  }

  // ─── 3. 요약 ───
  console.log("\n═══ 요약 ═══");
  console.log(`비율 포함 grape 문자열 총 ${grapeAllPolluted.length}종류가 term_dict 번역에서 실패.`);
  console.log(`이들은 본래 "품종 조합 표기"로 쓰인 것으로 보임 (품종 + 비율).`);
  console.log(`Phase 3 백필 시 처리 옵션:`);
  console.log(`  (a) 정규식으로 비율 제거 후 품종명만 추출하여 grape_varieties[]에 저장`);
  console.log(`      예: "40% Pinot Noir" → "Pinot Noir"`);
  console.log(`  (b) 해당 행은 기준 미달로 판정하여 raw_wines 대기 상태 유지`);
  console.log(`  (c) LLM으로 재파싱하여 비율 정보는 별도 필드(선택적)로 저장`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
