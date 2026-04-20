/**
 * gangnam raw_wines → wines promote (기준 충족 분만)
 *
 * 실행:
 *   NODE_ENV=development npx tsx scripts/promote-gangnam.ts --dry-run
 *   NODE_ENV=development npx tsx scripts/promote-gangnam.ts
 *
 * 조건:
 *   - raw_wines.source = 'gangnam' AND promoted_wine_id IS NULL
 *   - 필수 5개 필드 충족: name_ko, name_en, wine_type, country, grape_varieties[] 비어있지 않음
 *
 * 동작:
 *   - wines INSERT (신규 id)
 *   - raw_wines.promoted_wine_id 세팅
 *   - term_dict 룩업으로 country_ko/region_ko/grape_varieties_ko 함께 채움
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const CONCURRENCY = 10;

interface TermDictEntry { category: string; en: string; ko: string; aliases: string[]; }

function normKey(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*/g, " ").trim().toLowerCase().replace(/\s+/g, " ");
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

const VALID_WINE_TYPES = new Set(["red", "white", "rose", "sparkling", "fortified", "dessert", "other"]);

async function loadTermDict(): Promise<Map<string, TermDictEntry>> {
  const map = new Map<string, TermDictEntry>();
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from("term_dict")
      .select("category, en, ko, aliases")
      .order("category").order("en").range(offset, offset + 999);
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
      for (const a of e.aliases) if (a) map.set(`${e.category}::${normKey(a)}`, e);
    }
    if (data.length < 1000) break;
    offset += data.length;
  }
  return map;
}

function lookup(dict: Map<string, TermDictEntry>, cat: string, v: string | null): TermDictEntry | null {
  if (!v) return null;
  const n = normKey(v);
  return n ? dict.get(`${cat}::${n}`) ?? null : null;
}

async function main() {
  console.log(`═══ gangnam promote  ${DRY_RUN ? "[DRY-RUN]" : "[EXECUTING]"} ═══\n`);

  const dict = await loadTermDict();
  console.log(`term_dict 로드: ${dict.size} keys\n`);

  const rows: Array<Record<string, unknown>> = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from("raw_wines")
      .select("id, name_ko, name_en, wine_type, country, grape_variety, region, producer, description, price, image_url, alcohol, raw_payload")
      .eq("source", "gangnam")
      .is("promoted_wine_id", null)
      .order("id")
      .range(offset, offset + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as Array<Record<string, unknown>>));
    if (data.length < 1000) break;
    offset += data.length;
  }
  console.log(`gangnam 대기: ${rows.length.toLocaleString()}건`);

  let meets = 0;
  let skipped = 0;
  let inserted = 0;
  let errored = 0;
  const toInsert: Array<{ rawId: string; payload: Record<string, unknown> }> = [];

  for (const r of rows) {
    const nameKo = r.name_ko as string | null;
    const nameEn = r.name_en as string | null;
    let wineType = r.wine_type as string | null;
    if (wineType && !VALID_WINE_TYPES.has(wineType)) wineType = null;
    const country = r.country as string | null;
    const region = r.region as string | null;
    const grapeRaw = r.grape_variety as string | null;
    const grapes = grapeRaw ? cleanGrapeString(grapeRaw) : [];

    if (!nameKo || !nameEn || !wineType || !country || grapes.length === 0) {
      skipped++;
      continue;
    }
    meets++;

    const countryKo = lookup(dict, "country", country)?.ko ?? null;
    const regionKo = region ? lookup(dict, "region", region)?.ko ?? null : null;
    const gvKo: string[] = [];
    for (const g of grapes) {
      const e = lookup(dict, "grape", g);
      if (e && !gvKo.includes(e.ko)) gvKo.push(e.ko);
    }

    toInsert.push({
      rawId: r.id as string,
      payload: {
        name_ko: nameKo,
        name_en: nameEn,
        wine_type: wineType,
        country,
        region_path: region,
        grape_varieties: grapes,
        country_ko: countryKo,
        region_ko: regionKo,
        grape_varieties_ko: gvKo.length > 0 ? gvKo : null,
        producer: r.producer,
        description: r.description,
        price: r.price,
        image_url: r.image_url,
        source: "gangnam",
        source_refs: { gangnam_raw_id: r.id },
      },
    });
  }

  console.log(`기준 충족: ${meets.toLocaleString()}`);
  console.log(`스킵: ${skipped.toLocaleString()}\n`);

  if (DRY_RUN) {
    console.log("[DRY-RUN] INSERT 없음");
    console.log(`\n샘플 5건:`);
    for (const x of toInsert.slice(0, 5)) {
      console.log(`  ${(x.payload.name_ko as string) ?? "(null)"} / ${(x.payload.name_en as string) ?? "(null)"}  [${x.payload.wine_type}]`);
      console.log(`    country=${x.payload.country} → ${x.payload.country_ko}`);
      console.log(`    grapes=${JSON.stringify(x.payload.grape_varieties)} → ${JSON.stringify(x.payload.grape_varieties_ko)}`);
    }
    return;
  }

  console.log(`INSERT 실행 (concurrency ${CONCURRENCY})...`);
  let i = 0;
  while (i < toInsert.length) {
    const slice = toInsert.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      slice.map(async ({ rawId, payload }) => {
        const { data: ins, error: insErr } = await sb
          .from("wines")
          .insert(payload as never)
          .select("id")
          .single();
        if (insErr || !ins) throw insErr ?? new Error("insert failed");
        const { error: linkErr } = await sb
          .from("raw_wines")
          .update({ promoted_wine_id: (ins as { id: string }).id, promoted_at: new Date().toISOString() })
          .eq("id", rawId);
        if (linkErr) throw linkErr;
        return true;
      }),
    );
    for (const r of results) {
      if (r.status === "fulfilled") inserted++;
      else {
        errored++;
        if (errored < 5) console.error(`  error: ${JSON.stringify(r.reason).slice(0, 200)}`);
      }
    }
    i += CONCURRENCY;
    if (i % 100 === 0) process.stdout.write(`\r  INSERT ${inserted}  err ${errored}  `);
  }
  process.stdout.write("\n");

  console.log(`\n═══ 완료 ═══`);
  console.log(`  INSERT 성공: ${inserted.toLocaleString()}`);
  console.log(`  에러: ${errored}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
