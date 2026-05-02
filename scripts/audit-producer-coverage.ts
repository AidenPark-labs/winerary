// producer 한글·영문 보유 분포 측정
// 영문 통일 vs 한글 통일 시 LLM 변환 필요량 추산
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

async function fetchAll() {
  const out: any[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb
      .from("wines")
      .select("id, producer, producer_ko, producer_en, winery_en_clean, vivino_winery, final_producer")
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

  // 행별로 "영문 사용 가능 여부" 판정
  // 우선순위: producer_en → winery_en_clean → vivino_winery → producer/producer_ko (영문이면)
  let enDirectFromEn = 0; // producer_en에 영문 있음
  let enFromBackup = 0; // producer_en NULL, 다른 영문 자원에 있음
  let enFromMixed = 0; // 영문 직접 자원 X, 혼재값에서 영문 추출 필요 (보수적으로 셈)
  let enNeedsLlm = 0; // 한글만 있어서 LLM 변환 필요
  let allNull = 0; // 와이너리 정보 자체 없음

  // 한글 통일 시: producer/producer_ko에 한글 있나?
  let koDirect = 0;
  let koFromMixed = 0;
  let koNeedsLlm = 0;

  for (const r of rows) {
    // ── 영문 통일 시 ──
    const peClass = classify(r.producer_en);
    if (peClass === "en") {
      enDirectFromEn++;
    } else {
      const wceClass = classify(r.winery_en_clean);
      const vwClass = classify(r.vivino_winery);
      const pClass = classify(r.producer);
      const pkClass = classify(r.producer_ko);
      if (wceClass === "en" || vwClass === "en") {
        enFromBackup++;
      } else if (pClass === "en" || pkClass === "en") {
        enFromBackup++; // producer/producer_ko 자리에 영문 들어있는 경우
      } else if (
        pClass === "mixed" ||
        pkClass === "mixed" ||
        peClass === "mixed"
      ) {
        enFromMixed++;
      } else if (pClass === "ko" || pkClass === "ko" || peClass === "ko") {
        enNeedsLlm++;
      } else {
        allNull++;
      }
    }

    // ── 한글 통일 시 ──
    const pClass = classify(r.producer);
    const pkClass = classify(r.producer_ko);
    const fpClass = classify(r.final_producer);
    if (pClass === "ko" || pkClass === "ko" || fpClass === "ko") {
      koDirect++;
    } else if (pClass === "mixed" || pkClass === "mixed" || fpClass === "mixed") {
      koFromMixed++;
    } else {
      const peClass = classify(r.producer_en);
      const wceClass = classify(r.winery_en_clean);
      const vwClass = classify(r.vivino_winery);
      if (
        peClass === "en" ||
        wceClass === "en" ||
        vwClass === "en" ||
        pClass === "en" ||
        pkClass === "en"
      ) {
        koNeedsLlm++;
      }
      // allNull은 위에서 카운트
    }
  }

  console.log("\n=== 영문 통일 시 ===");
  console.log(`producer_en에 영문 있음 (직접):        ${enDirectFromEn}`);
  console.log(`다른 영문 자원에서 사용 가능 (backup):  ${enFromBackup}`);
  console.log(`혼재값에서 영문 추출 필요 (clean-up):   ${enFromMixed}`);
  console.log(`LLM 변환 필요 (한글만 있음):           ${enNeedsLlm}`);
  console.log(`모든 자원 NULL (정보 없음):            ${allNull}`);
  const enReady = enDirectFromEn + enFromBackup;
  console.log(`→ 영문 즉시 사용 가능: ${enReady} / ${rows.length} (${((enReady / rows.length) * 100).toFixed(1)}%)`);
  console.log(`→ LLM 변환 필요:      ${enNeedsLlm + enFromMixed}`);

  console.log("\n=== 한글 통일 시 ===");
  console.log(`producer/producer_ko/final_producer에 한글 (직접): ${koDirect}`);
  console.log(`혼재값에서 한글 추출 필요 (clean-up):              ${koFromMixed}`);
  console.log(`LLM 변환 필요 (영문만 있음):                       ${koNeedsLlm}`);
  console.log(`→ 한글 즉시 사용 가능: ${koDirect} / ${rows.length} (${((koDirect / rows.length) * 100).toFixed(1)}%)`);
  console.log(`→ LLM 변환 필요:      ${koNeedsLlm + koFromMixed}`);

  console.log("\n=== 비교 ===");
  console.log(`영문 통일: 즉시 ${enReady} / LLM ${enNeedsLlm + enFromMixed}`);
  console.log(`한글 통일: 즉시 ${koDirect} / LLM ${koNeedsLlm + koFromMixed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
