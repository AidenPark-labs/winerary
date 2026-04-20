/**
 * Phase 3 실 백필: wines 테이블 v3 신규 필드 채움
 *
 * 실행:
 *   NODE_ENV=development npx tsx scripts/backfill-wines-v3.ts
 *   NODE_ENV=development npx tsx scripts/backfill-wines-v3.ts --dry-run
 *   NODE_ENV=development npx tsx scripts/backfill-wines-v3.ts --resume
 *   NODE_ENV=development npx tsx scripts/backfill-wines-v3.ts --limit=1000
 *   NODE_ENV=development npx tsx scripts/backfill-wines-v3.ts --concurrency=20
 *
 * 동작:
 *   - wines 각 행에 대해 NULL 또는 빈 상태인 신규 필드만 채움 (기존 값 유지)
 *   - raw_wines(promoted_wine_id 매핑) + raw_payload + term_dict 활용
 *   - grape_varieties[]는 vivino_page_url/vivino_url 상세 URL 신뢰 조건 적용
 *   - 체크포인트 100 페이지마다 저장
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
const argV = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const argF = (n: string) => args.includes(`--${n}`);

const DRY_RUN = argF("dry-run");
const RESUME = argF("resume");
const LIMIT = argV("limit") ? parseInt(argV("limit")!, 10) : Infinity;
const CONCURRENCY = parseInt(argV("concurrency") || "20", 10);
const PAGE = 500;
const CHECKPOINT_PATH = path.join(process.cwd(), "backup", ".backfill-wines-v3.checkpoint.json");

type RawPayload = Record<string, unknown>;

interface TermDictEntry { category: string; en: string; ko: string; aliases: string[]; }

function normKey(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*/g, " ").trim().toLowerCase().replace(/\s+/g, " ");
}

function isVivinoDetailUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\/w\/\d+/.test(url);
}

function cleanGrapeString(s: string): string[] {
  return s
    .split(/[,;]/)
    .map((x) =>
      x.replace(/^\s*\d+(?:\.\d+)?\s*%\s*/, "")
       .replace(/\s*\d+(?:\.\d+)?\s*%\s*$/, "")
       .replace(/\s*\([^)]*\)\s*/g, " ")
       .trim(),
    )
    .filter((x) => x.length > 0 && !/^[\d%.\s]+$/.test(x));
}

async function loadTermDict(): Promise<Map<string, TermDictEntry>> {
  const map = new Map<string, TermDictEntry>();
  let offset = 0;
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
      const e: TermDictEntry = {
        category: r.category as string,
        en: r.en as string,
        ko: r.ko as string,
        aliases: (r.aliases as string[]) ?? [],
      };
      map.set(`${e.category}::${normKey(e.en)}`, e);
      map.set(`${e.category}::${normKey(e.ko)}`, e);
      for (const a of e.aliases) {
        if (a) map.set(`${e.category}::${normKey(a)}`, e);
      }
    }
    if (data.length < 1000) break;
    offset += data.length;
  }
  return map;
}

function lookupTerm(dict: Map<string, TermDictEntry>, category: string, value: string | null | undefined): TermDictEntry | null {
  if (!value) return null;
  const norm = normKey(value);
  if (!norm) return null;
  return dict.get(`${category}::${norm}`) ?? null;
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
  raw_payload: RawPayload | null;
}

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
  vivino_page_url: string | null;
  winery_en_clean: string | null;
  brand: string | null;
  search_query_en: string | null;
  wine_style: string | null;
  country_ko: string | null;
  region_ko: string | null;
  grape_varieties_ko: string[] | null;
  wine_style_ko: string | null;
}

interface UpdatePayload {
  wine_type?: string;
  country?: string;
  region_path?: string;
  grape_varieties?: string[];
  winery_en_clean?: string;
  brand?: string;
  search_query_en?: string;
  wine_style?: string;
  country_ko?: string;
  region_ko?: string;
  grape_varieties_ko?: string[];
  wine_style_ko?: string;
}

const VALID_WINE_TYPES = new Set(["red", "white", "rose", "sparkling", "fortified", "dessert", "other"]);

function inferWineTypeFromStyle(style: string | null | undefined): string | null {
  if (!style) return null;
  const low = style.toLowerCase();
  if (low.includes("rosé") || low.includes("rose")) return "rose";
  if (low.includes("red")) return "red";
  if (low.includes("white")) return "white";
  if (low.includes("sparkling") || low.includes("champagne")) return "sparkling";
  if (low.includes("dessert")) return "dessert";
  if (low.includes("fortified") || low.includes("port") || low.includes("sherry") || low.includes("madeira")) return "fortified";
  return null;
}

function computeUpdate(
  w: WineRow,
  raw: RawRow | null,
  dict: Map<string, TermDictEntry>,
): UpdatePayload {
  const upd: UpdatePayload = {};
  const payload = raw?.raw_payload ?? null;

  const payloadVivinoUrl = (payload?.vivino_url as string | null | undefined) ?? null;
  const payloadVivinoPageUrl = (payload?.vivino_page_url as string | null | undefined) ?? null;
  const vivinoTrusted =
    isVivinoDetailUrl(payloadVivinoUrl) ||
    isVivinoDetailUrl(payloadVivinoPageUrl) ||
    isVivinoDetailUrl(w.vivino_page_url);

  // wine_type
  if (!w.wine_type) {
    let wt: string | null = raw?.wine_type ?? null;
    if (wt && !VALID_WINE_TYPES.has(wt)) wt = inferWineTypeFromStyle(wt);
    if (!wt && vivinoTrusted) {
      wt = inferWineTypeFromStyle((payload?.vivino_style as string | null) ?? null);
    }
    if (wt && VALID_WINE_TYPES.has(wt)) upd.wine_type = wt;
  }

  // country
  if (!w.country && raw?.country) {
    upd.country = raw.country;
  }

  // region_path
  if (!w.region_path) {
    let rp: string | null = raw?.region ?? null;
    if (!rp && vivinoTrusted) {
      rp = (payload?.vivino_region as string | null) ?? null;
    }
    if (rp) upd.region_path = rp;
  }

  // grape_varieties
  const currentGv = w.grape_varieties ?? [];
  if (currentGv.length === 0) {
    let gv: string[] = [];
    if (vivinoTrusted) {
      const vgStr = payload?.vivino_grapes as string | null;
      if (vgStr) gv = cleanGrapeString(vgStr);
    }
    if (gv.length === 0 && w.grape_variety) {
      gv = cleanGrapeString(w.grape_variety);
    }
    if (gv.length === 0 && raw?.grape_variety) {
      gv = cleanGrapeString(raw.grape_variety);
    }
    if (gv.length > 0) upd.grape_varieties = gv;
  }

  // winery_en_clean, brand, search_query_en from parsed_*
  if (!w.winery_en_clean && payload?.winery_en_clean) {
    upd.winery_en_clean = payload.winery_en_clean as string;
  }
  if (!w.brand && payload?.parsed_brand) {
    upd.brand = payload.parsed_brand as string;
  }
  if (!w.search_query_en && payload?.parsed_search_query) {
    upd.search_query_en = payload.parsed_search_query as string;
  }

  // wine_style (영문, Vivino 신뢰)
  if (!w.wine_style && vivinoTrusted && payload?.vivino_style) {
    upd.wine_style = payload.vivino_style as string;
  }

  // country_ko
  const effectiveCountry = upd.country ?? w.country;
  if (!w.country_ko && effectiveCountry) {
    const e = lookupTerm(dict, "country", effectiveCountry);
    if (e) upd.country_ko = e.ko;
  }

  // region_ko
  const effectiveRegion = upd.region_path ?? w.region_path;
  if (!w.region_ko && effectiveRegion) {
    const e = lookupTerm(dict, "region", effectiveRegion);
    if (e) upd.region_ko = e.ko;
  }

  // grape_varieties_ko
  const effectiveGrapes = upd.grape_varieties ?? currentGv;
  const currentGvKo = w.grape_varieties_ko ?? [];
  if (currentGvKo.length === 0 && effectiveGrapes.length > 0) {
    const gvKo: string[] = [];
    for (const g of effectiveGrapes) {
      const e = lookupTerm(dict, "grape", g);
      if (e && !gvKo.includes(e.ko)) gvKo.push(e.ko);
    }
    if (gvKo.length > 0) upd.grape_varieties_ko = gvKo;
  }

  // wine_style_ko
  const effectiveStyle = upd.wine_style ?? w.wine_style;
  if (!w.wine_style_ko && effectiveStyle) {
    // 단순 화이트리스트 매칭 (Red/White/Rose/Sparkling/Dessert/Fortified)
    for (const cand of ["Red", "White", "Rose", "Rosé", "Sparkling", "Dessert", "Fortified"]) {
      if (effectiveStyle.toLowerCase().includes(cand.toLowerCase())) {
        const e = lookupTerm(dict, "style", cand);
        if (e) {
          upd.wine_style_ko = e.ko;
          break;
        }
      }
    }
  }

  return upd;
}

interface Checkpoint {
  lastOffset: number;
  processed: number;
  updated: number;
  skipped: number;
  errors: number;
  fieldCounts: Record<string, number>;
  startedAt: string;
  updatedAt: string;
}

async function loadRawMap(): Promise<Map<string, RawRow>> {
  const map = new Map<string, RawRow>();
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from("raw_wines")
      .select("id, promoted_wine_id, source, name_ko, name_en, wine_type, country, grape_variety, region, raw_payload")
      .not("promoted_wine_id", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.promoted_wine_id) map.set(r.promoted_wine_id as string, r as RawRow);
    }
    if (data.length < PAGE) break;
    offset += data.length;
  }
  return map;
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Phase 3 실 백필  ${DRY_RUN ? "[DRY-RUN]" : "[EXECUTING]"}`);
  console.log("═══════════════════════════════════════════════════\n");

  console.log("[1/3] term_dict 로드...");
  const dict = await loadTermDict();
  console.log(`  ${dict.size} lookup 키`);

  console.log("[2/3] raw_wines 로드...");
  const rawMap = await loadRawMap();
  console.log(`  ${rawMap.size.toLocaleString()} wines.id로 매핑됨`);

  let checkpoint: Checkpoint = {
    lastOffset: 0,
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    fieldCounts: {},
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (RESUME && fs.existsSync(CHECKPOINT_PATH)) {
    checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, "utf-8"));
    console.log(`  📍 resume: offset ${checkpoint.lastOffset}, processed ${checkpoint.processed}`);
  }

  console.log("\n[3/3] wines 백필 실행...");
  let offset = checkpoint.lastOffset;
  const startProcessed = checkpoint.processed;

  while (true) {
    const { data, error } = await sb
      .from("wines")
      .select("id, data_source, source, name_ko, name_en, wine_type, country, grape_variety, grape_varieties, region, region_path, vivino_page_url, winery_en_clean, brand, search_query_en, wine_style, country_ko, region_ko, grape_varieties_ko, wine_style_ko")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    const updates: Array<{ id: string; upd: UpdatePayload }> = [];
    for (const w of data as unknown as WineRow[]) {
      const raw = rawMap.get(w.id) ?? null;
      const upd = computeUpdate(w, raw, dict);
      if (Object.keys(upd).length === 0) {
        checkpoint.skipped++;
      } else {
        updates.push({ id: w.id, upd });
        for (const k of Object.keys(upd)) {
          checkpoint.fieldCounts[k] = (checkpoint.fieldCounts[k] ?? 0) + 1;
        }
      }
      checkpoint.processed++;
    }

    if (!DRY_RUN && updates.length > 0) {
      let i = 0;
      while (i < updates.length) {
        const slice = updates.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          slice.map((u) => sb.from("wines").update(u.upd).eq("id", u.id)),
        );
        for (const r of results) {
          if (r.status === "fulfilled" && !r.value.error) {
            checkpoint.updated++;
          } else {
            checkpoint.errors++;
            if (checkpoint.errors < 5) {
              const err = r.status === "fulfilled" ? r.value.error : r.reason;
              console.error(`  error: ${JSON.stringify(err).slice(0, 200)}`);
            }
          }
        }
        i += CONCURRENCY;
      }
    } else if (DRY_RUN) {
      checkpoint.updated += updates.length;
    }

    offset += data.length;
    checkpoint.lastOffset = offset;
    checkpoint.updatedAt = new Date().toISOString();

    if (offset % (PAGE * 5) === 0 || data.length < PAGE) {
      fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2));
      process.stdout.write(
        `\r  progress: ${checkpoint.processed.toLocaleString()}/36,410 | updated ${checkpoint.updated.toLocaleString()} | skip ${checkpoint.skipped.toLocaleString()} | err ${checkpoint.errors}  `,
      );
    }

    if (data.length < PAGE) break;
    if (checkpoint.processed - startProcessed >= LIMIT) break;
  }

  process.stdout.write("\n");
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2));

  console.log("\n═══════════════════════════════════════════════════");
  console.log(`  결과  ${DRY_RUN ? "(DRY-RUN)" : ""}`);
  console.log("═══════════════════════════════════════════════════");
  console.log(`  처리: ${checkpoint.processed.toLocaleString()}`);
  console.log(`  업데이트: ${checkpoint.updated.toLocaleString()}`);
  console.log(`  스킵 (변경 없음): ${checkpoint.skipped.toLocaleString()}`);
  console.log(`  에러: ${checkpoint.errors}`);
  console.log(`\n  필드별 채움 건수:`);
  for (const [k, n] of Object.entries(checkpoint.fieldCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(22)} ${n.toLocaleString()}`);
  }
  if (!DRY_RUN && checkpoint.errors === 0 && fs.existsSync(CHECKPOINT_PATH)) {
    fs.unlinkSync(CHECKPOINT_PATH);
    console.log("\n  ✅ 체크포인트 파일 정리됨");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
