/**
 * Vivino PoC 결과 교차검증 (1단계: producer 매칭, 2단계: LLM 판정)
 *
 * 입력: /tmp/vivino_poc_results.json
 * 출력: 각 성공 매칭의 confidence 등급 + LLM 최종 판정
 *
 * 실행: npx tsx scripts/validate-vivino-poc.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "fs";
import Anthropic from "@anthropic-ai/sdk";

const RESULTS_PATH = "/tmp/vivino_poc_results.json";

// vivino-crawler.ts와 동일한 정규화
const STOP_WORDS = new Set([
  "la", "le", "de", "du", "des", "les", "el", "il", "di", "da", "del",
  "the", "and", "of", "et", "en", "a", "mon", "ma", "au",
  "rose", "red", "white", "brut", "dry", "sweet", "vin", "wine",
]);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchScore(query: string, candidate: string): number {
  const nq = normalize(query);
  const nc = normalize(candidate);
  if (!nq || !nc) return 0;
  if (nc.includes(nq)) return 1.0;
  if (nq.includes(nc) && nc.length > 5) return 0.95;

  const coreQ = nq.split(" ").filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  const coreC = nc.split(" ").filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  if (!coreQ.length) return 0;

  let found = 0;
  for (const w of coreQ) {
    if (coreC.some((cw) => cw === w)) found++;
  }
  return found / coreQ.length;
}

interface PocResult {
  input: {
    source_id: string;
    name_ko: string;
    name_en: string;
    producer_en: string | null;
  };
  success: boolean;
  vivinoName?: string;
  rating?: number | null;
  reviews?: number | null;
  grapes?: string;
  region?: string;
  firstScore?: number;
  crossScore?: number;
  step?: string;
  error?: string;
}

type Verdict = "confirmed" | "rejected" | "uncertain";

async function llmVerify(
  client: Anthropic,
  wine21Name: string,
  wine21Producer: string | null,
  vivinoName: string,
  vivinoGrapes: string | undefined,
  vivinoRegion: string | undefined
): Promise<{ verdict: Verdict; reasoning: string }> {
  const prompt = `당신은 와인 전문가입니다. 한국 수입사 표기와 Vivino 검색 결과가 같은 와인인지 판정하세요.

판정 원칙:
- 같은 와이너리의 같은 와인(다른 빈티지는 허용): YES
- 다른 와이너리, 다른 큐베, 명백히 다른 와인: NO
- 정보가 부족해도 이름/지역/품종이 고도로 일치하면 YES로 기울여라
- UNCERTAIN은 정말 판단이 불가능한 경우에만 사용
- 철자 오류(Boillot→Pillot 같은 한 글자 차이는 실제로 다른 생산자일 가능성 높음)에 주의
- 한국 수입사의 철자 오탈자(Cardina→Cardinal, Monteplciano→Montepulciano)는 허용
- 와이너리 소속 브랜드 관계(Barton & Guestier 아래 Thomas Barton)는 YES

한국 수입사 표기:
- 와인명: ${wine21Name}
- 생산자: ${wine21Producer ?? "(정보 없음)"}

Vivino 매칭 결과:
- 와인명: ${vivinoName}
- 품종: ${vivinoGrapes || "(없음)"}
- 지역: ${vivinoRegion || "(없음)"}

JSON으로만 응답: {"verdict": "YES" | "NO" | "UNCERTAIN", "reason": "한 줄 이유"}`;

  const res = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });
  const text = res.content[0].type === "text" ? res.content[0].text : "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { verdict: "uncertain", reasoning: "LLM 응답 파싱 실패" };
  try {
    const json = JSON.parse(m[0]);
    const v = String(json.verdict).toUpperCase();
    return {
      verdict: v === "YES" ? "confirmed" : v === "NO" ? "rejected" : "uncertain",
      reasoning: json.reason || "",
    };
  } catch {
    return { verdict: "uncertain", reasoning: "JSON 파싱 실패" };
  }
}

async function main() {
  const all: PocResult[] = JSON.parse(readFileSync(RESULTS_PATH, "utf-8"));
  const successes = all.filter((r) => r.success);
  console.log(`총 ${all.length}건 중 성공 ${successes.length}건 검증\n`);

  // 1단계: producer 교차검증
  const tiered = successes.map((r) => {
    const producerScore = r.input.producer_en && r.vivinoName
      ? matchScore(r.input.producer_en, r.vivinoName)
      : null;
    let tier: "HIGH" | "MEDIUM" | "LOW" | "NO_PRODUCER";
    if (producerScore === null) tier = "NO_PRODUCER";
    else if (producerScore >= 0.8) tier = "HIGH";
    else if (producerScore >= 0.5) tier = "MEDIUM";
    else tier = "LOW";
    return { ...r, producerScore, tier };
  });

  // 1단계 통계
  const tierCounts = tiered.reduce((acc, r) => {
    acc[r.tier] = (acc[r.tier] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log("=== 1단계: producer 교차검증 ===");
  console.log(`HIGH (>=0.8):       ${tierCounts.HIGH || 0}건`);
  console.log(`MEDIUM (0.5~0.8):   ${tierCounts.MEDIUM || 0}건`);
  console.log(`LOW (<0.5):         ${tierCounts.LOW || 0}건`);
  console.log(`NO_PRODUCER:        ${tierCounts.NO_PRODUCER || 0}건\n`);

  // LOW/MEDIUM/NO_PRODUCER 리스트 출력
  const suspicious = tiered.filter((r) => r.tier !== "HIGH");
  if (suspicious.length > 0) {
    console.log("=== 의심 매칭 (LOW/MEDIUM/NO_PRODUCER) ===");
    suspicious.forEach((r, i) => {
      console.log(`\n[${i + 1}] tier=${r.tier} producerScore=${r.producerScore?.toFixed(2) ?? "-"}`);
      console.log(`    wine21:   ${r.input.name_en}`);
      console.log(`    producer: ${r.input.producer_en ?? "(없음)"}`);
      console.log(`    vivino:   ${r.vivinoName}`);
    });
  }

  // 2단계: LOW + MEDIUM만 LLM에 던지기 (HIGH는 자동 통과, NO_PRODUCER도 LLM 체크)
  const toVerify = tiered.filter((r) => r.tier !== "HIGH");
  console.log(`\n\n=== 2단계: LLM 판정 (${toVerify.length}건) ===`);

  const client = new Anthropic();
  const verdicts: Array<{ r: typeof tiered[0]; verdict: Verdict; reasoning: string }> = [];

  for (let i = 0; i < toVerify.length; i++) {
    const r = toVerify[i];
    process.stdout.write(`[${i + 1}/${toVerify.length}] ${r.input.name_en.slice(0, 50)}... `);
    try {
      const v = await llmVerify(
        client,
        r.input.name_en,
        r.input.producer_en,
        r.vivinoName!,
        r.grapes,
        r.region
      );
      const icon =
        v.verdict === "confirmed" ? "✅" : v.verdict === "rejected" ? "❌" : "❓";
      console.log(`${icon} ${v.verdict} — ${v.reasoning.slice(0, 80)}`);
      verdicts.push({ r, verdict: v.verdict, reasoning: v.reasoning });
    } catch (e: any) {
      console.log(`⚠ ${e.message}`);
      verdicts.push({ r, verdict: "uncertain", reasoning: e.message });
    }
  }

  // 최종 집계
  const confirmed = verdicts.filter((v) => v.verdict === "confirmed").length;
  const rejected = verdicts.filter((v) => v.verdict === "rejected").length;
  const uncertain = verdicts.filter((v) => v.verdict === "uncertain").length;

  const totalCorrect = (tierCounts.HIGH || 0) + confirmed;
  const totalWrong = rejected;
  const totalUnsure = uncertain;
  const pocTotal = all.length;
  const pocSuccess = successes.length;

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🎯 최종 집계 (원본 ${pocTotal}건 기준)`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Vivino 매칭 자체 실패: ${pocTotal - pocSuccess}건`);
  console.log(`매칭 성공 but 오매칭:   ${totalWrong}건`);
  console.log(`매칭 성공 + 불확실:     ${totalUnsure}건`);
  console.log(`매칭 성공 + 확인:       ${totalCorrect}건`);
  console.log(``);
  console.log(`→ 실제 신뢰 가능: ${totalCorrect}/${pocTotal} (${((totalCorrect / pocTotal) * 100).toFixed(0)}%)`);
  console.log(`→ 기존 82% 대비 실제 품질 저하: ${(((pocSuccess - totalCorrect) / pocTotal) * 100).toFixed(0)}%p`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
