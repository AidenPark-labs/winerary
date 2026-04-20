/**
 * Phase 3 백필 Dry-run (READ-ONLY)
 *
 * 실행: NODE_ENV=development npx tsx scripts/dryrun-backfill-wines-v3.ts
 *
 * wines 전체 행에 대해 Phase 3 백필 로직을 시뮬레이션:
 *   - 각 신규 필드별 소스 탐색 (raw_wines 컬럼 → raw_payload JSONB)
 *   - grape_varieties[]는 (B) 방침: vivino_page_url 신뢰 조건
 *   - term_dict 룩업 히트율
 *   - 기준 충족/미달 예상 건수 산출
 *   - wine_records/wishlist 참조 중 기준 미달 건
 *
 * 출력:
 *   - 카테고리별 백필 가능 건수
 *   - 기준 5개 필드 각각 충족률 (백필 후 예상)
 *   - 최종 wines 예상 건수 (소스별)
 *   - term_dict 룩업 실패 용어 (needs_translation 후보)
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PAGE = 1000;

type RawPayload = Record<string, unknown>;

interface WineRow {
  id: string;
  data_source: string | null;
  source: string | null;
  name_ko: string | null;
  name_en: string | null;
  wine_type: string | null;
  country: string | null;
  grape_variety: string | null;
  grape_varieties: string[] | null;
  region: string | null;
  region_path: string | null;
  producer: string | null;
  producer_ko: string | null;
  producer_en: string | null;
  vivino_url: string | null;
  vivino_page_url: string | null;
  vivino_grapes: string | null;
  vivino_region: string | null;
  vivino_style: string | null;
  vivino_winery: string | null;
  vivino_rating: number | null;
  vivino_reviews: number | null;
  vivino_wine_id: number | null;
  final_grapes: string | null;
  final_region: string | null;
  final_country: string | null;
  final_wine_type: string | null;
  final_style: string | null;
  naver_image: string | null;
  image_url: string | null;
  winery_en_clean: string | null;
  brand: string | null;
  search_query_en: string | null;
  wine_style: string | null;
  country_ko: string | null;
  region_ko: string | null;
  grape_varieties_ko: string[] | null;
  wine_style_ko: string | null;
}

interface RawRow {
  id: string;
  promoted_wine_id: string | null;
  source: string;
  name_ko: string | null;
  name_en: string | null;
  wine_type: string | null;
  country: string | null;
  grape_variety: string | null;
  region: string | null;
  producer: string | null;
  raw_payload: RawPayload | null;
}

// ─── term_dict 로드 ───
interface TermDictEntry {
  category: string;
  en: string;
  ko: string;
  aliases: string[];
}

function normKey(s: string): string {
  return s
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isVivinoDetailUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\/w\/\d+/.test(url);
}

async function loadTermDict(): Promise<Map<string, TermDictEntry>> {
  const map = new Map<string, TermDictEntry>();
  // pagination
  let offset = 0;
  const all: TermDictEntry[] = [];
  while (true) {
    const { data, error } = await sb
      .from("term_dict")
      .select("category, en, ko, aliases")
      .order("category")
      .order("en")
      .range(offset, offset + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      all.push({
        category: r.category as string,
        en: r.en as string,
        ko: r.ko as string,
        aliases: (r.aliases as string[]) ?? [],
      });
    }
    if (data.length < 1000) break;
    offset += data.length;
  }
  for (const entry of all) {
    map.set(`${entry.category}::${normKey(entry.en)}`, entry);
    map.set(`${entry.category}::${normKey(entry.ko)}`, entry);
    for (const a of entry.aliases) {
      if (a) map.set(`${entry.category}::${normKey(a)}`, entry);
    }
  }
  return map;
}

function lookupTerm(
  dict: Map<string, TermDictEntry>,
  category: string,
  value: string | null,
): TermDictEntry | null {
  if (!value) return null;
  const norm = normKey(value);
  if (!norm) return null;
  return dict.get(`${category}::${norm}`) ?? null;
}

// ─── grape_variety 정규식 정제 ───
function cleanGrapeString(s: string): string[] {
  return s
    .split(/[,;]/)
    .map((x) =>
      x
        .replace(/^\s*\d+(?:\.\d+)?\s*%\s*/, "")
        .replace(/\s*\d+(?:\.\d+)?\s*%\s*$/, "")
        .replace(/\s*\([^)]*\)\s*/g, " ")
        .trim(),
    )
    .filter((x) => x.length > 0 && !/^[\d%.\s]+$/.test(x));
}

// ─── 백필 로직 시뮬레이션 ───
interface BackfillSim {
  wineId: string;
  source: string;
  // 필수 5개 필드 예상 값
  predicted_name_ko: string | null;
  predicted_name_en: string | null;
  predicted_wine_type: string | null;
  predicted_country: string | null;
  predicted_grape_varieties: string[];
  // 한글 필드 예상
  predicted_country_ko: string | null;
  predicted_region_ko: string | null;
  predicted_grape_varieties_ko: string[];
  predicted_wine_style_ko: string | null;
  // 소스별 출처
  grape_source:
    | "vivino_grapes"
    | "grape_variety"
    | "raw_grape_variety"
    | null;
  region_source:
    | "wines.region_path"
    | "raw_wines.region"
    | "raw_payload.vivino_region"
    | null;
  // 메타
  meets_required: boolean;
  missing_fields: string[];
  term_dict_misses: string[]; // 한글화 사전 miss한 용어
}

function simulateBackfill(
  w: WineRow,
  rawByPromoted: Map<string, RawRow>,
  dict: Map<string, TermDictEntry>,
): BackfillSim {
  const raw = rawByPromoted.get(w.id) ?? null;
  const payload = raw?.raw_payload ?? null;
  const payloadVivinoUrl = (payload?.vivino_url as string | null | undefined) ?? null;
  const payloadVivinoPageUrl = (payload?.vivino_page_url as string | null | undefined) ?? null;
  // wines.vivino_page_url 있거나 raw_payload에 상세 URL 패턴이 있으면 신뢰
  const vivinoTrusted =
    isVivinoDetailUrl(payloadVivinoUrl) ||
    isVivinoDetailUrl(payloadVivinoPageUrl) ||
    isVivinoDetailUrl(w.vivino_page_url);

  // (필수) name_ko, name_en
  const name_ko = w.name_ko ?? raw?.name_ko ?? null;
  const name_en = w.name_en ?? raw?.name_en ?? null;

  // (필수) wine_type
  let wine_type: string | null = w.wine_type ?? raw?.wine_type ?? null;
  // vivino_style의 접미어 "Red/White/..." 에서 추론 가능하지만 엄격 정제
  if (!wine_type && vivinoTrusted) {
    const vivinoStyle = (payload?.vivino_style as string | null) ?? null;
    if (vivinoStyle) {
      const low = vivinoStyle.toLowerCase();
      if (low.includes("red")) wine_type = "red";
      else if (low.includes("white")) wine_type = "white";
      else if (low.includes("rosé") || low.includes("rose")) wine_type = "rose";
      else if (low.includes("sparkling") || low.includes("champagne")) wine_type = "sparkling";
      else if (low.includes("dessert")) wine_type = "dessert";
      else if (low.includes("fortified") || low.includes("port") || low.includes("sherry")) wine_type = "fortified";
    }
  }

  // (필수) country
  const country =
    w.country ??
    raw?.country ??
    null;

  // (필수) grape_varieties[] — (B) 방침: vivino_grapes 신뢰 조건, parsed fallback 금지
  let grape_varieties: string[] = [];
  let grape_source: BackfillSim["grape_source"] = null;

  if (vivinoTrusted) {
    const vg = payload?.vivino_grapes as string | null;
    if (vg) {
      grape_varieties = cleanGrapeString(vg);
      if (grape_varieties.length > 0) grape_source = "vivino_grapes";
    }
  }
  if (grape_varieties.length === 0 && w.grape_variety) {
    grape_varieties = cleanGrapeString(w.grape_variety);
    if (grape_varieties.length > 0) grape_source = "grape_variety";
  }
  if (grape_varieties.length === 0 && raw?.grape_variety) {
    grape_varieties = cleanGrapeString(raw.grape_variety);
    if (grape_varieties.length > 0) grape_source = "raw_grape_variety";
  }

  // region
  let region_path: string | null = w.region_path ?? raw?.region ?? null;
  let region_source: BackfillSim["region_source"] = null;
  if (w.region_path) region_source = "wines.region_path";
  else if (raw?.region) region_source = "raw_wines.region";
  else if (vivinoTrusted && payload?.vivino_region) {
    region_path = payload.vivino_region as string;
    region_source = "raw_payload.vivino_region";
  }

  // term_dict 한글화
  const miss: string[] = [];
  const countryEntry = lookupTerm(dict, "country", country);
  const predicted_country_ko = countryEntry?.ko ?? null;
  if (country && !countryEntry) miss.push(`country:${country}`);

  const regionEntry = lookupTerm(dict, "region", region_path);
  const predicted_region_ko = regionEntry?.ko ?? null;
  if (region_path && !regionEntry) miss.push(`region:${region_path}`);

  const predicted_grape_varieties_ko: string[] = [];
  for (const g of grape_varieties) {
    const e = lookupTerm(dict, "grape", g);
    if (e) predicted_grape_varieties_ko.push(e.ko);
    else miss.push(`grape:${g}`);
  }

  // wine_style_ko: vivino_style에서 Red/White/... 추출
  let predicted_wine_style_ko: string | null = null;
  const vivinoStyle = vivinoTrusted ? (payload?.vivino_style as string | null) : null;
  if (vivinoStyle) {
    // 화이트리스트 기반 매칭
    for (const cand of ["Red", "White", "Rose", "Rosé", "Sparkling", "Dessert", "Fortified"]) {
      if (vivinoStyle.toLowerCase().includes(cand.toLowerCase())) {
        const e = lookupTerm(dict, "style", cand);
        if (e) {
          predicted_wine_style_ko = e.ko;
          break;
        }
      }
    }
  }

  // 기준 충족 판정
  const missing: string[] = [];
  if (!name_ko) missing.push("name_ko");
  if (!name_en) missing.push("name_en");
  if (!wine_type) missing.push("wine_type");
  if (!country) missing.push("country");
  if (grape_varieties.length === 0) missing.push("grape_varieties");

  return {
    wineId: w.id,
    source: w.data_source ?? w.source ?? "unknown",
    predicted_name_ko: name_ko,
    predicted_name_en: name_en,
    predicted_wine_type: wine_type,
    predicted_country: country,
    predicted_grape_varieties: grape_varieties,
    predicted_country_ko,
    predicted_region_ko,
    predicted_grape_varieties_ko,
    predicted_wine_style_ko,
    grape_source,
    region_source,
    meets_required: missing.length === 0,
    missing_fields: missing,
    term_dict_misses: miss,
  };
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  Phase 3 백필 Dry-run");
  console.log("═══════════════════════════════════════════════════\n");

  console.log("[1/4] term_dict 로드...");
  const dict = await loadTermDict();
  console.log(`  ${dict.size} lookup 키 (unique 엔트리 수: ~${dict.size / 3}+)`);

  console.log("\n[2/4] raw_wines 로드 (promoted_wine_id 있는 행만)...");
  const rawByPromoted = new Map<string, RawRow>();
  let offset = 0;
  let rawLoaded = 0;
  while (true) {
    const { data, error } = await sb
      .from("raw_wines")
      .select("id, promoted_wine_id, source, name_ko, name_en, wine_type, country, grape_variety, region, producer, raw_payload")
      .not("promoted_wine_id", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.promoted_wine_id) rawByPromoted.set(r.promoted_wine_id as string, r as RawRow);
    }
    rawLoaded += data.length;
    if (data.length < PAGE) break;
    offset += data.length;
  }
  console.log(`  raw_wines 로드: ${rawLoaded.toLocaleString()}건 / Map 매핑: ${rawByPromoted.size.toLocaleString()} (유니크 promoted_wine_id)`);

  console.log("\n[3/4] wines 전체 로드 + 백필 시뮬레이션...");
  const bySource: Record<string, { total: number; meets: number; missing: Record<string, number> }> = {};
  const grapeSourceDist: Record<string, number> = {};
  const regionSourceDist: Record<string, number> = {};
  const allMisses: Map<string, number> = new Map();
  const trustedVivinoCount = { yes: 0, no: 0 };
  const countryKoSet = { matched: 0, missed: 0 };

  offset = 0;
  let processed = 0;
  while (true) {
    const { data, error } = await sb
      .from("wines")
      .select("*")
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const w of data as unknown as WineRow[]) {
      const sim = simulateBackfill(w, rawByPromoted, dict);
      const src = sim.source;
      if (!bySource[src]) bySource[src] = { total: 0, meets: 0, missing: {} };
      bySource[src].total++;
      if (sim.meets_required) bySource[src].meets++;
      for (const m of sim.missing_fields) {
        bySource[src].missing[m] = (bySource[src].missing[m] ?? 0) + 1;
      }
      if (sim.grape_source) grapeSourceDist[sim.grape_source] = (grapeSourceDist[sim.grape_source] ?? 0) + 1;
      if (sim.region_source) regionSourceDist[sim.region_source] = (regionSourceDist[sim.region_source] ?? 0) + 1;
      if (sim.predicted_country) {
        if (sim.predicted_country_ko) countryKoSet.matched++;
        else countryKoSet.missed++;
      }
      for (const m of sim.term_dict_misses) {
        allMisses.set(m, (allMisses.get(m) ?? 0) + 1);
      }
      processed++;
    }
    if (data.length < PAGE) break;
    offset += data.length;
    process.stdout.write(`\r  처리 ${processed.toLocaleString()} / 36,410  `);
  }
  process.stdout.write("\n");

  console.log("\n[4/4] 결과 요약");
  console.log("═══════════════════════════════════════════════════");
  console.log("\n【소스별 백필 후 기준 충족 예상】");
  let grandTotal = 0;
  let grandMeets = 0;
  for (const [src, stats] of Object.entries(bySource).sort((a, b) => b[1].total - a[1].total)) {
    const pct = ((stats.meets / stats.total) * 100).toFixed(1);
    console.log(`  ${src.padEnd(20)} 전체: ${stats.total.toLocaleString().padStart(6)}  충족: ${stats.meets.toLocaleString().padStart(6)} (${pct}%)`);
    for (const [field, n] of Object.entries(stats.missing).sort((a, b) => b[1] - a[1])) {
      console.log(`     └ ${field.padEnd(18)} 누락 ${n.toLocaleString()}`);
    }
    grandTotal += stats.total;
    grandMeets += stats.meets;
  }
  console.log(`\n  ★ 합계: 전체 ${grandTotal.toLocaleString()} / 백필 후 충족 ${grandMeets.toLocaleString()} (${((grandMeets / grandTotal) * 100).toFixed(1)}%)`);

  console.log("\n【grape_varieties 소스 분포】");
  for (const [src, n] of Object.entries(grapeSourceDist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${src.padEnd(25)} ${n.toLocaleString()}`);
  }

  console.log("\n【region_path 소스 분포】");
  for (const [src, n] of Object.entries(regionSourceDist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${src.padEnd(30)} ${n.toLocaleString()}`);
  }

  console.log("\n【term_dict 한글화 커버리지 (country 기준)】");
  console.log(`  country_ko 매칭: ${countryKoSet.matched.toLocaleString()}`);
  console.log(`  country_ko 미매칭: ${countryKoSet.missed.toLocaleString()}`);

  console.log("\n【term_dict miss 상위 20 (fallback 대상)】");
  const missArr = Array.from(allMisses.entries()).sort((a, b) => b[1] - a[1]);
  for (const [term, n] of missArr.slice(0, 20)) {
    console.log(`  ${n.toString().padStart(6)}  ${term}`);
  }
  console.log(`  ... (총 ${missArr.length.toLocaleString()}종류)`);

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Dry-run 완료");
  console.log("═══════════════════════════════════════════════════");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
