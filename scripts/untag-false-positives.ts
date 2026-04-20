/**
 * (E1) False positive untag
 *
 * 품종 충돌 + 확실한 스타일 충돌 건에서 vivino_url을 null로 되돌려 untag.
 * (vivino_name, vivino_wine_id 등은 traceability 위해 raw_payload에 보존.
 *  추가로 vivino_untagged_at, vivino_untag_reason 필드 기록)
 *
 * 제외:
 *   - 스타일 충돌이지만 winery_en/name에 color keyword 포함된 경우 (Cheval Blanc 패턴)
 *
 * 실행:
 *   NODE_ENV=development npx tsx scripts/untag-false-positives.ts --dry-run  # preview CSV만
 *   NODE_ENV=development npx tsx scripts/untag-false-positives.ts            # 실제 untag
 */

import { config } from "dotenv";
import { writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const HEADERS = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const CONCURRENCY = 10;

// ─── 정규화 & 데이터 ────────────────────────────────────────────────────────

const STOP_WORDS = new Set(["la","le","de","du","des","les","el","il","di","da","del","the","and","of","et","en","a","mon","ma","au","rose","red","white","brut","dry","sweet","vin","wine"]);
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
const COLOR_MARKERS: Record<"Red"|"White"|"Rosé", string[]> = {
  Red: ["rouge","rosso","tinto"],
  White: ["blanc","bianco","branco","blanco"],
  Rosé: ["rosado","rosato"],
};

// ─── 검출 로직 ──────────────────────────────────────────────────────────────

function detectGrapeConflict(detailName: string, grapes: string[]): string | null {
  if (!grapes.length) return null;
  const hay = normalize(detailName);
  const ourGrapesNorm = grapes.map(normalize);
  if (ourGrapesNorm.some((g) => hay.includes(g))) return null;
  const otherGrape = GRAPE_LIST.find((g) => {
    const gn = normalize(g);
    if (hay.includes(gn)) return !ourGrapesNorm.some((og) => og.includes(gn) || gn.includes(og));
    return false;
  });
  return otherGrape ?? null;
}

function detectStyleConflict(detailName: string, style: string | null, name_en: string, wineryEn: string | null): { conflict: string | null; falseAlarm: boolean } {
  if (style !== "Red" && style !== "White" && style !== "Rosé") return { conflict: null, falseAlarm: false };
  const hay = normalize(detailName);
  let detected: keyof typeof COLOR_MARKERS | null = null;
  for (const k of ["Red","White","Rosé"] as const) {
    for (const m of COLOR_MARKERS[k]) {
      if (new RegExp(`\\b${m}\\b`).test(hay)) { detected = k; break; }
    }
    if (detected) break;
  }
  if (!detected || detected === style) return { conflict: null, falseAlarm: false };

  // False alarm 필터: winery_en 혹은 name_en 앞부분에 detected color keyword가 winery 일부로 포함된 경우
  // 예: Chateau Cheval Blanc — winery_en에 "Blanc"이 있고 detail에도 "blanc"이 있지만 이건 winery명
  const wineryHay = normalize([wineryEn ?? "", name_en].join(" "));
  const detectedMarkers = COLOR_MARKERS[detected];
  for (const m of detectedMarkers) {
    if (new RegExp(`\\b${m}\\b`).test(wineryHay)) {
      return { conflict: detected, falseAlarm: true };
    }
  }
  return { conflict: detected, falseAlarm: false };
}

// ─── DB ────────────────────────────────────────────────────────────────────

async function fetchAll(): Promise<Array<{ id: string; name_en: string; raw_payload: Record<string, unknown> }>> {
  const all: Array<{ id: string; name_en: string; raw_payload: Record<string, unknown> }> = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/raw_wines?source=eq.wine21&raw_payload->>vivino_url=not.is.null&select=id,name_en,raw_payload&order=id.asc&offset=${offset}&limit=${PAGE}`,
      { headers: HEADERS }
    );
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const data = (await res.json()) as Array<{ id: string; name_en: string; raw_payload: Record<string, unknown> }>;
    if (!data.length) break;
    all.push(...data);
    process.stdout.write(`\r  로드 ${all.length}...`);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  process.stdout.write("\n");
  return all;
}

async function patchUntag(id: string, payload: Record<string, unknown>, reason: string): Promise<void> {
  const now = new Date().toISOString();
  const merged = {
    ...payload,
    vivino_url: null,
    vivino_untagged_at: now,
    vivino_untag_reason: reason,
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/raw_wines?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...HEADERS, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ raw_payload: merged }),
  });
  if (!res.ok) throw new Error(`PATCH ${res.status} id=${id}`);
}

// ─── 메인 ──────────────────────────────────────────────────────────────────

interface Target {
  id: string;
  name_en: string;
  vivino_name: string;
  our_grapes: string;
  our_style: string | null;
  winery: string;
  reason: "grape_conflict" | "style_conflict";
  detail: string;
  payload: Record<string, unknown>;
}

async function main() {
  console.log(`🎯 False positive untag (DRY=${DRY_RUN})\n`);

  const rows = await fetchAll();
  console.log(`  audit 대상: ${rows.length}건\n`);

  const targets: Target[] = [];
  let skippedFalseAlarm = 0;

  for (const r of rows) {
    const p = r.raw_payload ?? {};
    const vname = (p.vivino_name as string) ?? "";
    if (!vname) continue;
    const grapes = (p.parsed_grape_varieties as string[]) ?? [];
    const style = (p.parsed_wine_style as string | null) ?? null;
    const winery = ((p.winery_en_clean as string | null) ?? (p.winery_en as string | null)) ?? "";

    // 1. 품종 충돌
    const gc = detectGrapeConflict(vname, grapes);
    if (gc) {
      targets.push({
        id: r.id, name_en: r.name_en, vivino_name: vname, our_grapes: grapes.join("|"),
        our_style: style, winery, reason: "grape_conflict", detail: `우리=${grapes.join(",")}, detail=${gc}`,
        payload: p,
      });
      continue; // grape 충돌이면 style 검사 skip
    }

    // 2. 스타일 충돌
    const sc = detectStyleConflict(vname, style, r.name_en, winery);
    if (sc.conflict && !sc.falseAlarm) {
      targets.push({
        id: r.id, name_en: r.name_en, vivino_name: vname, our_grapes: grapes.join("|"),
        our_style: style, winery, reason: "style_conflict", detail: `우리=${style}, detail=${sc.conflict}`,
        payload: p,
      });
    } else if (sc.conflict && sc.falseAlarm) {
      skippedFalseAlarm++;
    }
  }

  const grapeCount = targets.filter((t) => t.reason === "grape_conflict").length;
  const styleCount = targets.filter((t) => t.reason === "style_conflict").length;

  console.log(`========== 대상 집계 ==========`);
  console.log(`품종 충돌: ${grapeCount}건`);
  console.log(`스타일 충돌 (정리 대상): ${styleCount}건`);
  console.log(`스타일 충돌 (false alarm, skip): ${skippedFalseAlarm}건`);
  console.log(`총 untag 대상: ${targets.length}건\n`);

  // preview CSV
  const csvEscape = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
  const csv = [
    "id,reason,name_en,vivino_name,detail,our_grapes,our_style,winery",
    ...targets.map((t) => [t.id, t.reason, t.name_en, t.vivino_name, t.detail, t.our_grapes, t.our_style ?? "", t.winery].map(csvEscape).join(",")),
  ].join("\n");
  const outCsv = join(tmpdir(), "untag-candidates.csv");
  writeFileSync(outCsv, csv);
  console.log(`📄 preview CSV: ${outCsv}`);

  // 샘플
  console.log(`\n=== 품종 충돌 샘플 (상위 5) ===`);
  for (const t of targets.filter((x) => x.reason === "grape_conflict").slice(0, 5)) {
    console.log(`  "${t.name_en.slice(0, 55)}" → "${t.vivino_name.slice(0, 70)}"`);
    console.log(`    ${t.detail}`);
  }
  console.log(`\n=== 스타일 충돌 샘플 (상위 5, 대상) ===`);
  for (const t of targets.filter((x) => x.reason === "style_conflict").slice(0, 5)) {
    console.log(`  "${t.name_en.slice(0, 55)}" → "${t.vivino_name.slice(0, 70)}"`);
    console.log(`    ${t.detail}  winery="${t.winery}"`);
  }

  if (DRY_RUN) {
    console.log("\n⚠ DRY_RUN — 실제 변경 없음. --dry-run 없이 다시 실행하면 untag 수행");
    return;
  }

  // 실제 untag
  console.log(`\n🚀 untag 실행 시작...`);
  let patched = 0, errors = 0;
  const start = Date.now();
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const group = targets.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(group.map((t) => patchUntag(t.id, t.payload, t.reason)));
    for (const r of results) {
      if (r.status === "fulfilled") patched++;
      else { errors++; console.error(`\n  ⚠ ${(r.reason as Error).message}`); }
    }
    process.stdout.write(`\r  patched=${patched} errors=${errors}   `);
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n\n========== 완료 ==========`);
  console.log(`patched: ${patched}`);
  console.log(`errors: ${errors}`);
  console.log(`소요: ${elapsed}s`);
}

main().catch((e) => { console.error("\n❌", e); process.exit(1); });
