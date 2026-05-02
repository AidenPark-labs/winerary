// 컬럼별 언어 혼재 현황 감사
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const HANGUL = /[가-힯ᄀ-ᇿ㄰-㆏]/;
const LATIN = /[A-Za-z]/;

function classify(v: unknown): "ko" | "en" | "mixed" | "other" | "null" {
  if (v == null) return "null";
  const s = String(v).trim();
  if (!s) return "null";
  const hasKo = HANGUL.test(s);
  const hasEn = LATIN.test(s);
  if (hasKo && hasEn) return "mixed";
  if (hasKo) return "ko";
  if (hasEn) return "en";
  return "other";
}

function classifyArray(v: unknown): "ko" | "en" | "mixed" | "other" | "null" {
  if (!Array.isArray(v) || v.length === 0) return "null";
  const cats = new Set(v.map((x) => classify(x)).filter((c) => c !== "null"));
  if (cats.size === 0) return "null";
  if (cats.has("mixed") || cats.size > 1) return "mixed";
  return [...cats][0] as any;
}

async function fetchAll(): Promise<any[]> {
  const out: any[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from("wines")
      .select(
        "country,country_ko,region,region_ko,region_path,producer,producer_ko,producer_en,winery_en_clean,vivino_winery,grape_variety,grape_varieties,grape_varieties_ko,vivino_grapes,wine_type,wine_style,wine_style_ko,vivino_style,description,vivino_description,brand,name_ko,name_en",
      )
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function main() {
  const rows = await fetchAll();
  console.log("총 wines:", rows.length);

  const COL_SCALAR = [
    "name_ko",
    "name_en",
    "country",
    "country_ko",
    "region",
    "region_ko",
    "region_path",
    "producer",
    "producer_ko",
    "producer_en",
    "winery_en_clean",
    "vivino_winery",
    "grape_variety",
    "wine_type",
    "wine_style",
    "wine_style_ko",
    "vivino_style",
    "description",
    "vivino_description",
    "brand",
  ];
  const COL_ARRAY = ["grape_varieties", "grape_varieties_ko", "vivino_grapes"];

  const buckets: Record<string, Record<string, number>> = {};

  for (const col of [...COL_SCALAR, ...COL_ARRAY]) {
    buckets[col] = { ko: 0, en: 0, mixed: 0, other: 0, null: 0 };
  }

  for (const r of rows) {
    for (const col of COL_SCALAR) {
      buckets[col][classify(r[col])]++;
    }
    for (const col of COL_ARRAY) {
      buckets[col][classifyArray(r[col])]++;
    }
  }

  console.log(
    "\n컬럼".padEnd(24),
    "한글".padStart(7),
    "영어".padStart(7),
    "혼재".padStart(7),
    "기타".padStart(7),
    "NULL".padStart(7),
    "비고",
  );
  console.log("-".repeat(80));

  for (const col of [...COL_SCALAR, ...COL_ARRAY]) {
    const b = buckets[col];
    const total = b.ko + b.en + b.mixed + b.other + b.null;
    const filled = total - b.null;
    const note = filled === 0 ? "(전체 NULL)" : "";
    console.log(
      col.padEnd(24),
      String(b.ko).padStart(7),
      String(b.en).padStart(7),
      String(b.mixed).padStart(7),
      String(b.other).padStart(7),
      String(b.null).padStart(7),
      note,
    );
  }

  // 대표 샘플
  console.log("\n=== producer 샘플 (한글값 5, 영어값 5) ===");
  const koProducers = rows.filter((r) => classify(r.producer) === "ko").slice(0, 5);
  const enProducers = rows.filter((r) => classify(r.producer) === "en").slice(0, 5);
  for (const r of koProducers) console.log("KO:", r.producer);
  for (const r of enProducers) console.log("EN:", r.producer);

  console.log("\n=== wine_type unique 값 ===");
  const wt = new Set(rows.map((r) => r.wine_type).filter(Boolean));
  console.log([...wt].slice(0, 30).join(" | "));

  console.log("\n=== wine_style unique top 20 ===");
  const styleCount = new Map<string, number>();
  for (const r of rows) {
    if (r.wine_style)
      styleCount.set(r.wine_style, (styleCount.get(r.wine_style) ?? 0) + 1);
  }
  const top = [...styleCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  for (const [k, v] of top) console.log(v, k);

  console.log("\n=== country 한·영 동일 와인 충돌 케이스 ===");
  let conflict = 0;
  const examples: any[] = [];
  for (const r of rows) {
    const a = classify(r.country);
    const b = classify(r.country_ko);
    if (a === "en" && b === "ko" && r.country && r.country_ko) {
      conflict++;
      if (examples.length < 5) examples.push({ country: r.country, country_ko: r.country_ko });
    }
  }
  console.log("country=영 + country_ko=한 동시 존재:", conflict);
  for (const e of examples) console.log(" ", e.country, "→", e.country_ko);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
