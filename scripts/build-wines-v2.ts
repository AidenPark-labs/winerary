/**
 * Phase 1.3 — wines → wines_v2 + vivino_wines backfill
 *
 * 흐름:
 *   1. wines 전수 페이지 로드
 *   2. 각 행을 WinesV2Input으로 매핑 (fallback 우선순위 적용)
 *   3. transformInput → wines_v2 row + (있으면) vivino_wines row
 *   4. 배치 INSERT (50건씩)
 *
 * 모드:
 *   --dry-run: 변환만 + 통계
 *   --apply: 실제 INSERT
 *   --limit=N: 처음 N건만
 *
 * 실행:
 *   NODE_ENV=development npx tsx scripts/build-wines-v2.ts --dry-run
 *   NODE_ENV=development npx tsx scripts/build-wines-v2.ts --apply
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import {
  loadTermDict,
  transformInput,
  type WinesV2Input,
  type WinesV2Row,
  type VivinoWineRow,
  type VivinoInput,
} from "../src/lib/wines-v2-transform";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const args = process.argv.slice(2);
const argV = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const argF = (n: string) => args.includes(`--${n}`);
const DRY_RUN = argF("dry-run") || !argF("apply");
const LIMIT = argV("limit") ? parseInt(argV("limit")!, 10) : Infinity;

const VALID_SOURCES = new Set([
  "wine21",
  "winenara",
  "gangnam",
  "naver_shopping",
  "user_submission",
  "admin",
]);

// ============================================================================
// wines 행 → WinesV2Input 어댑터
// ============================================================================

function rowToInput(w: any): { input: WinesV2Input; warnings: string[] } | null {
  const warnings: string[] = [];

  // source: enum 위반 시 'admin'으로 fallback
  let source = (w.source || w.data_source || "").trim().toLowerCase();
  if (!VALID_SOURCES.has(source)) {
    warnings.push(`source_fallback:${source || "(empty)"}`);
    source = "admin";
  }

  // country: final_country > country_ko > country
  const country = w.final_country?.trim() || w.country_ko?.trim() || w.country?.trim() || "";

  // region: final_region > region_ko > region > region_path
  const region =
    w.final_region?.trim() || w.region_ko?.trim() || w.region?.trim() || w.region_path?.trim() || null;

  // wine_type
  const wine_type = w.final_wine_type?.trim() || w.wine_type?.trim() || null;

  // wine_style: final_style > wine_style > vivino_style (영문 우선)
  const wine_style =
    w.final_style?.trim() || w.wine_style?.trim() || w.vivino_style?.trim() || null;

  // producer (영문 단일): producer_en > winery_en_clean > vivino_winery > final_producer > producer > producer_ko
  const producer =
    w.producer_en?.trim() ||
    w.winery_en_clean?.trim() ||
    w.vivino_winery?.trim() ||
    w.final_producer?.trim() ||
    w.producer?.trim() ||
    w.producer_ko?.trim() ||
    null;

  // grape_varieties: final_grapes > grape_varieties_ko > grape_varieties > grape_variety (콤마 분리)
  let grape_varieties: string[] = [];
  if (Array.isArray(w.final_grapes) && w.final_grapes.length > 0) {
    grape_varieties = w.final_grapes;
  } else if (Array.isArray(w.grape_varieties_ko) && w.grape_varieties_ko.length > 0) {
    grape_varieties = w.grape_varieties_ko;
  } else if (Array.isArray(w.grape_varieties) && w.grape_varieties.length > 0) {
    grape_varieties = w.grape_varieties;
  } else if (typeof w.grape_variety === "string" && w.grape_variety.trim()) {
    grape_varieties = w.grape_variety
      .split(/[,;/]/)
      .map((s: string) => s.trim())
      .filter(Boolean);
  }

  // alcohol
  const alcohol =
    w.final_alcohol ?? w.alcohol ?? w.vivino_alcohol ?? w.gangnam_alcohol ?? null;

  // description (한글 우선; vivino_description은 영문이라 안 씀)
  const description = w.final_description?.trim() || w.description?.trim() || null;

  // image_url
  const image_url = w.image_url?.trim() || w.naver_image?.trim() || null;

  // vivino input
  const vivino: VivinoInput | null = w.vivino_url
    ? {
        url: w.vivino_url,
        wine_id: w.vivino_wine_id ?? null,
        name: w.vivino_name ?? null,
        rating: w.vivino_rating ?? null,
        reviews: w.vivino_reviews ?? null,
        winery: w.vivino_winery ?? null,
        grapes: w.vivino_grapes ?? null,
        region: w.vivino_region ?? null,
        style: w.vivino_style ?? null,
        alcohol: w.vivino_alcohol ?? null,
        description: w.vivino_description ?? null,
        allergens: w.vivino_allergens ?? null,
        image_url: null,
        match_score: w.vivino_reviewed_at ? 0.95 : null, // 어드민 검수 완료된 것은 autoReviewed로
      }
    : null;

  // legacy (source_snapshot 빌드용)
  const legacy = {
    naver_link: w.naver_link ?? undefined,
    naver_image: w.naver_image ?? undefined,
    gangnam_alcohol: w.gangnam_alcohol ?? undefined,
    review_image_url: w.review_image_url ?? undefined,
  };

  const input: WinesV2Input = {
    source: source as any,
    source_refs: Array.isArray(w.source_refs) ? w.source_refs : undefined,
    name_ko: w.name_ko ?? "",
    name_en: w.name_en ?? "",
    country,
    region,
    wine_type,
    wine_style,
    producer,
    grape_varieties,
    alcohol,
    brand: w.brand ?? null,
    price: w.price ?? null,
    description,
    image_url,
    is_published: w.is_published ?? true,
    locked_fields: Array.isArray(w.locked_fields) ? w.locked_fields : undefined,
    vivino,
    legacy,
  };

  return { input, warnings };
}

// ============================================================================
// 메인
// ============================================================================

async function fetchWinesPage(from: number, page: number): Promise<any[]> {
  const { data, error } = await sb
    .from("wines")
    .select("*")
    .order("id")
    .range(from, from + page - 1);
  if (error) throw error;
  return data ?? [];
}

interface Stats {
  total: number;
  okCount: number;
  errorCount: number;
  errorMessages: Record<string, number>;
  vivinoCount: number;
  needsReviewCount: number;
  reasonsCount: Record<string, number>;
  warningsCount: Record<string, number>;
  errorRows: Array<{ id: string; error: string }>;
}

async function main() {
  console.log(`[mode] ${DRY_RUN ? "DRY-RUN (변환만, INSERT X)" : "APPLY (실제 INSERT)"}`);
  console.log(`[limit] ${LIMIT === Infinity ? "전체" : LIMIT}`);

  const dict = await loadTermDict(sb);
  console.log(`[term_dict] 로드 완료`);

  const stats: Stats = {
    total: 0,
    okCount: 0,
    errorCount: 0,
    errorMessages: {},
    vivinoCount: 0,
    needsReviewCount: 0,
    reasonsCount: {},
    warningsCount: {},
    errorRows: [],
  };

  const PAGE = 500;
  const BATCH_INSERT = 50;
  let from = 0;

  // 변환 결과 누적 버퍼
  const winesBuffer: WinesV2Row[] = [];
  const vivinoBuffer: VivinoWineRow[] = [];

  const flushBuffers = async () => {
    if (DRY_RUN) {
      winesBuffer.length = 0;
      vivinoBuffer.length = 0;
      return;
    }
    if (winesBuffer.length > 0) {
      const { error } = await sb.from("wines_v2").insert(winesBuffer);
      if (error) throw new Error(`wines_v2 INSERT: ${error.message}`);
      winesBuffer.length = 0;
    }
    if (vivinoBuffer.length > 0) {
      const { error } = await sb.from("vivino_wines").insert(vivinoBuffer);
      if (error) throw new Error(`vivino_wines INSERT: ${error.message}`);
      vivinoBuffer.length = 0;
    }
  };

  while (stats.total < LIMIT) {
    const remaining = LIMIT - stats.total;
    const pageSize = Math.min(PAGE, remaining);
    const rows = await fetchWinesPage(from, pageSize);
    if (rows.length === 0) break;

    for (const w of rows) {
      stats.total++;
      const adapted = rowToInput(w);
      if (!adapted) {
        stats.errorCount++;
        stats.errorRows.push({ id: w.id, error: "adapter_null" });
        continue;
      }

      for (const warn of adapted.warnings) {
        stats.warningsCount[warn] = (stats.warningsCount[warn] ?? 0) + 1;
      }

      const result = await transformInput(sb, adapted.input, dict);
      if (!result.ok) {
        stats.errorCount++;
        stats.errorMessages[result.error] = (stats.errorMessages[result.error] ?? 0) + 1;
        stats.errorRows.push({ id: w.id, error: result.error });
        continue;
      }

      stats.okCount++;
      if (result.vivinoRow) stats.vivinoCount++;
      if (result.needs_review_reasons.length > 0) {
        stats.needsReviewCount++;
        for (const r of result.needs_review_reasons) {
          // category만 카운트 (input은 너무 다양)
          const cat = r.split(":")[0];
          stats.reasonsCount[cat] = (stats.reasonsCount[cat] ?? 0) + 1;
        }
      }

      // 버퍼 추가
      winesBuffer.push({
        id: w.id,
        ...result.wineRow,
      } as WinesV2Row);
      if (result.vivinoRow) {
        vivinoBuffer.push({
          wine_id: w.id,
          ...result.vivinoRow,
        } as VivinoWineRow);
      }

      if (winesBuffer.length >= BATCH_INSERT) {
        await flushBuffers();
      }
    }

    if (rows.length < pageSize) break;
    from += rows.length;
    if (stats.total % 2000 === 0) {
      console.log(`  [progress] ${stats.total} 처리 (ok ${stats.okCount} / err ${stats.errorCount} / vivino ${stats.vivinoCount})`);
    }
  }

  // 마지막 flush
  await flushBuffers();

  // 통계
  console.log(`\n========================`);
  console.log(`총 처리: ${stats.total}`);
  console.log(`  ok: ${stats.okCount}`);
  console.log(`  error: ${stats.errorCount}`);
  console.log(`  vivino_wines 생성: ${stats.vivinoCount}`);
  console.log(`  needs_review: ${stats.needsReviewCount}`);
  console.log(`\n[needs_review 사유 (category)]`);
  for (const [k, v] of Object.entries(stats.reasonsCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }
  if (Object.keys(stats.errorMessages).length > 0) {
    console.log(`\n[에러 사유]`);
    for (const [k, v] of Object.entries(stats.errorMessages)) {
      console.log(`  ${k}: ${v}`);
    }
  }
  if (Object.keys(stats.warningsCount).length > 0) {
    console.log(`\n[경고]`);
    for (const [k, v] of Object.entries(stats.warningsCount)) {
      console.log(`  ${k}: ${v}`);
    }
  }
  if (stats.errorRows.length > 0 && stats.errorRows.length <= 20) {
    console.log(`\n[error rows (샘플 ≤ 20)]`);
    for (const r of stats.errorRows.slice(0, 20)) {
      console.log(`  ${r.id}: ${r.error}`);
    }
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
