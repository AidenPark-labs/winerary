/**
 * (A) 품종 충돌로 FP 확정된 후보 207건을 CSV로 내보냄
 *
 * DB 쓰지 않음. /tmp/grape-conflict-candidates.csv 생성.
 * 확인 후 별도 스크립트로 vivino_url 등 untag 예정.
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
config({ path: ".env.local" });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

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

function detectConflict(detailName: string, grapes: string[]): string | null {
  if (!grapes.length) return null;
  const hay = normalize(detailName);
  const ourGrapesNorm = grapes.map(normalize);
  if (ourGrapesNorm.some((g) => hay.includes(g))) return null;
  const otherGrape = GRAPE_LIST.find((g) => {
    const gn = normalize(g);
    if (hay.includes(gn)) {
      return !ourGrapesNorm.some((og) => og.includes(gn) || gn.includes(og));
    }
    return false;
  });
  return otherGrape ?? null;
}

async function main() {
  console.log("🔍 품종 충돌 후보 추출 중...");
  const rows: Array<{ id: string; name_en: string; vivino_name: string; vivino_url: string; our_grapes: string; detail_grape: string }> = [];
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
      const grapes = (p.parsed_grape_varieties as string[]) ?? [];
      if (!vname || !grapes.length) continue;
      const conflict = detectConflict(vname, grapes);
      if (conflict) {
        rows.push({
          id: r.id,
          name_en: r.name_en as string,
          vivino_name: vname,
          vivino_url: p.vivino_url as string,
          our_grapes: grapes.join("|"),
          detail_grape: conflict,
        });
      }
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  console.log(`  후보: ${rows.length}건`);

  // CSV 작성
  const csvEscape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv = [
    "id,name_en,vivino_name,our_grapes,detail_grape,vivino_url",
    ...rows.map((r) => [r.id, r.name_en, r.vivino_name, r.our_grapes, r.detail_grape, r.vivino_url].map(csvEscape).join(",")),
  ].join("\n");
  const out = join(tmpdir(), "grape-conflict-candidates.csv");
  writeFileSync(out, csv);
  console.log(`\n📄 저장: ${out}`);
  console.log(`  (spot check 후 별도 스크립트로 vivino_url 등 untag 예정)`);

  // 샘플 10건
  console.log(`\n샘플 10건:`);
  for (const r of rows.slice(0, 10)) {
    console.log(`  "${r.name_en.slice(0, 55)}"`);
    console.log(`    → "${r.vivino_name.slice(0, 70)}"`);
    console.log(`    우리 품종=${r.our_grapes}, detail 품종=${r.detail_grape}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
