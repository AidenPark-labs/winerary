/**
 * 기존 Vivino 매칭 precision audit
 *
 * 13,304건의 기존 매칭을 v3 가드(품종/빈티지/스타일/와이너리)로 소급 검증.
 * guard reject 건 = false positive 후보.
 *
 * 데이터 소스:
 *   - raw_payload.vivino_name (저장된 매칭 결과)
 *   - raw_payload.parsed_grape_varieties / parsed_vintage / parsed_wine_style (LLM)
 *   - raw_payload.winery_en (DB 원본)
 *
 * DB 쓰지 않음. 결과만 출력.
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// ─── 가드 로직 (pilot-vivino-rematch.ts에서 복제) ────────────────────────────

const STOP_WORDS = new Set([
  "la","le","de","du","des","les","el","il","di","da","del",
  "the","and","of","et","en","a","mon","ma","au",
  "rose","red","white","brut","dry","sweet","vin","wine",
]);
function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

const GRAPE_LIST = [
  "cabernet sauvignon","cabernet franc","cabernet","merlot","syrah","shiraz","pinot noir","pinot grigio","pinot gris","pinot blanc",
  "chardonnay","sauvignon blanc","riesling","nebbiolo","sangiovese","tempranillo","grenache","garnacha","mourvedre","malbec","zinfandel",
  "chenin blanc","viognier","gewurztraminer","semillon","montepulciano","barbera","dolcetto","aglianico","verdicchio","garganega",
  "moscato","muscat","vermentino","albarino","godello","touriga","carmenere","petit verdot","gamay","nero d avola","primitivo",
  "corvina","fiano","falanghina","trebbiano","glera","pinotage","assyrtiko",
];

const COLOR_MARKERS: Record<"Red" | "White" | "Rosé", string[]> = {
  Red: ["rouge", "rosso", "tinto"],
  White: ["blanc", "bianco", "branco", "blanco"],
  Rosé: ["rosado", "rosato"],
};

const WINERY_SUFFIX_STOPS = new Set([
  ...STOP_WORDS,
  "winery","wines","wine","vineyards","vineyard","cellars","cellar","estate","estates",
  "domaine","maison","bodegas","bodega","tenuta","cantina","chateau","castillo","azienda","agricola","weingut","quinta",
]);

type GuardReason = "grape" | "vintage" | "style" | "winery" | null;

function guardWine(
  detailName: string,
  grapes: string[],
  vintage: number | null,
  style: string | null,
  wineryEn: string | null,
): { pass: boolean; reason?: GuardReason; detail?: string } {
  const hay = normalize(detailName);

  if (grapes.length > 0) {
    const ourGrapesNorm = grapes.map(normalize);
    const ourMatch = ourGrapesNorm.some((g) => hay.includes(g));
    if (!ourMatch) {
      const otherGrape = GRAPE_LIST.find((g) => {
        const gn = normalize(g);
        if (hay.includes(gn)) {
          return !ourGrapesNorm.some((og) => og.includes(gn) || gn.includes(og));
        }
        return false;
      });
      if (otherGrape) return { pass: false, reason: "grape", detail: `우리=${grapes.join(",")}, detail=${otherGrape}` };
    }
  }

  if (vintage != null) {
    const yearsInDetail = (detailName.match(/\b(19|20)\d{2}\b/g) ?? []).map((y) => parseInt(y, 10));
    if (yearsInDetail.length > 0 && !yearsInDetail.includes(vintage)) {
      return { pass: false, reason: "vintage", detail: `우리=${vintage}, detail=${yearsInDetail.join(",")}` };
    }
  }

  if (style === "Red" || style === "White" || style === "Rosé") {
    let detected: keyof typeof COLOR_MARKERS | null = null;
    for (const k of ["Red", "White", "Rosé"] as const) {
      for (const m of COLOR_MARKERS[k]) {
        if (new RegExp(`\\b${m}\\b`).test(hay)) { detected = k; break; }
      }
      if (detected) break;
    }
    if (detected && detected !== style) {
      return { pass: false, reason: "style", detail: `우리=${style}, detail=${detected}` };
    }
  }

  if (wineryEn) {
    const tokens = normalize(wineryEn).split(" ").filter((w) => w.length > 2 && !WINERY_SUFFIX_STOPS.has(w));
    if (tokens.length >= 2) {
      const found = tokens.filter((t) => hay.includes(t)).length;
      if (found / tokens.length < 0.7) {
        return { pass: false, reason: "winery", detail: `${found}/${tokens.length}: ${tokens.join(",")}` };
      }
    }
  }

  return { pass: true };
}

// ─── 메인 ──────────────────────────────────────────────────────────────────

interface Row {
  id: string;
  name_en: string;
  vivino_name: string;
  vivino_url: string;
  grapes: string[];
  vintage: number | null;
  style: string | null;
  wineryEn: string | null;
}

async function main() {
  console.log("🔍 기존 Vivino 매칭 audit (v3 가드 소급)\n");

  const rows: Row[] = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb.from("raw_wines")
      .select("id, name_en, raw_payload")
      .eq("source", "wine21")
      .not("raw_payload->>vivino_url", "is", null)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      const p = r.raw_payload as Record<string, unknown>;
      const vname = (p.vivino_name as string) ?? "";
      if (!vname) continue; // vivino_name이 없으면 검증 불가
      rows.push({
        id: r.id,
        name_en: r.name_en as string,
        vivino_name: vname,
        vivino_url: p.vivino_url as string,
        grapes: (p.parsed_grape_varieties as string[]) ?? [],
        vintage: (p.parsed_vintage as number | null) ?? null,
        style: (p.parsed_wine_style as string | null) ?? null,
        wineryEn: ((p.winery_en_clean as string | null) ?? (p.winery_en as string | null)) ?? null,
      });
    }
    if (data.length < PAGE) break;
    offset += PAGE;
    process.stdout.write(`\r  로드 ${rows.length}...`);
  }
  process.stdout.write("\n");
  console.log(`  audit 대상: ${rows.length}건\n`);

  // 카운터
  const stats = { pass: 0, grape: 0, vintage: 0, style: 0, winery: 0 };
  const samples: Record<Exclude<GuardReason, null>, Row[]> = { grape: [], vintage: [], style: [], winery: [] };

  for (const r of rows) {
    const g = guardWine(r.vivino_name, r.grapes, r.vintage, r.style, r.wineryEn);
    if (g.pass) {
      stats.pass++;
    } else if (g.reason) {
      stats[g.reason]++;
      if (samples[g.reason].length < 10) samples[g.reason].push(r);
    }
  }

  const failTotal = stats.grape + stats.vintage + stats.style + stats.winery;
  const failPct = (failTotal / rows.length) * 100;

  console.log("========== 결과 ==========\n");
  console.log(`전체: ${rows.length}`);
  console.log(`  PASS (가드 통과): ${stats.pass} (${((stats.pass / rows.length) * 100).toFixed(1)}%)`);
  console.log(`  FAIL 의심: ${failTotal} (${failPct.toFixed(1)}%)`);
  console.log(`    ├ 품종 충돌: ${stats.grape}`);
  console.log(`    ├ 빈티지 충돌: ${stats.vintage}`);
  console.log(`    ├ 스타일 충돌: ${stats.style}`);
  console.log(`    └ 와이너리 토큰 부족: ${stats.winery}`);

  // 샘플 출력
  const dumpSamples = (label: string, reason: Exclude<GuardReason, null>) => {
    console.log(`\n=== ${label} 샘플 (상위 10) ===`);
    for (const r of samples[reason]) {
      const p = guardWine(r.vivino_name, r.grapes, r.vintage, r.style, r.wineryEn);
      console.log(`  "${r.name_en.slice(0, 55)}"`);
      console.log(`    vivino: "${r.vivino_name.slice(0, 70)}"`);
      console.log(`    우리 grapes=[${r.grapes.join(",")}] v=${r.vintage ?? "-"} style=${r.style ?? "-"} winery="${r.wineryEn ?? "-"}"`);
      console.log(`    → ${p.detail}`);
    }
  };
  dumpSamples("품종 충돌", "grape");
  dumpSamples("빈티지 충돌", "vintage");
  dumpSamples("스타일 충돌", "style");
  dumpSamples("와이너리 토큰 부족", "winery");

  console.log("\n========== 해석 가이드 ==========");
  console.log("- 품종/스타일 충돌: 대체로 true false-positive (다른 와인에 잘못 매칭됨)");
  console.log("- 빈티지 충돌: vintage만 다른 같은 와인일 수도 (덜 심각)");
  console.log("- 와이너리 토큰 부족: winery_en 자체가 오염됐을 가능성 (sample 확인 필요)");
}

main().catch((e) => { console.error(e); process.exit(1); });
