/**
 * 와인명 구조 분리 PoC
 *
 * name_ko + name_en을 LLM으로 파싱하여
 * { winery, brand, grape, region, classification } 구조로 분리.
 *
 * 100건 샘플로 정확도 검증.
 *
 * 실행: npx tsx scripts/poc-wine-name-parse.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import Anthropic from "@anthropic-ai/sdk";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

interface Wine {
  name_ko: string;
  name_en: string | null;
  producer_ko: string | null;
  producer_en: string | null;
  grape_variety: string | null;
  region: string | null;
  country: string | null;
}

interface ParsedWine {
  winery: string | null;
  brand: string | null;
  grape: string | null;
  region: string | null;
  classification: string | null;
}

// 다양한 패턴을 커버하도록 여러 offset에서 샘플링
async function fetchSamples(): Promise<Wine[]> {
  const offsets = [0, 2000, 5000, 10000, 15000, 20000, 25000, 30000, 33000, 35000];
  const all: Wine[] = [];

  for (const offset of offsets) {
    const url = `${SUPABASE_URL}/rest/v1/wines?select=name_ko,name_en,producer_ko,producer_en,grape_variety,region,country&order=name_ko.asc&limit=10&offset=${offset}`;
    const res = await fetch(url, { headers });
    const data: Wine[] = await res.json();
    all.push(...data);
  }
  return all;
}

async function parseWineNames(
  client: Anthropic,
  wines: Wine[]
): Promise<{ input: Wine; parsed: ParsedWine; raw: string }[]> {
  // 배치 10건씩 처리 (토큰 효율)
  const results: { input: Wine; parsed: ParsedWine; raw: string }[] = [];
  const batchSize = 10;

  for (let i = 0; i < wines.length; i += batchSize) {
    const batch = wines.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(wines.length / batchSize);
    console.log(`[${batchNum}/${totalBatches}] Processing ${batch.length} wines...`);

    const wineList = batch
      .map(
        (w, idx) =>
          `${idx + 1}. name_ko: "${w.name_ko}" | name_en: "${w.name_en ?? ""}" | producer_ko: "${w.producer_ko ?? ""}" | producer_en: "${w.producer_en ?? ""}"`
      )
      .join("\n");

    const prompt = `당신은 와인 도메인 전문가입니다. 아래 와인명을 구성 요소로 분리하세요.

구성 요소:
- winery: 생산자/와이너리명 (예: Château Margaux, 보시오 비니)
- brand: 큐베명/브랜드명/시리즈명. 와이너리명·품종·지역·등급을 제외한 고유 이름 (예: Albero in Fiore, Grand Vin, 1865)
- grape: 품종 (예: Cabernet Sauvignon, 모스카토)
- region: 지역/AOC/DO (예: Bordeaux, 다스티, Napa Valley)
- classification: 등급/스타일 (예: Grand Cru, Riserva, Brut, DOCG, IGT, Reserva)

규칙:
1. name_ko와 name_en을 모두 참고하되, 한국어 기준으로 파싱
2. producer_ko/en이 제공되면 참고하되, name_ko에 없는 정보면 winery에 null
3. 해당 요소가 와인명에 없으면 null
4. 하나의 토큰이 여러 역할을 할 수 있음 (예: "바롤로"는 region이자 DOCG)
5. "블랑 드 블랑", "로제" 등은 classification
6. "[위클리 세일]" 같은 프로모션 태그는 모두 무시
7. 모든 값은 반드시 한국어(name_ko 기준)로 작성. 영어로 답변하지 마세요. 예: "Alexis Lichine" → "알렉시스 리신", "Yvon Mau" → "이봉모"

JSON 배열로만 응답 (마크다운 코드블록 없이):
[{"winery":"...", "brand":"...", "grape":"...", "region":"...", "classification":"..."}, ...]

와인 목록:
${wineList}`;

    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = res.content[0].type === "text" ? res.content[0].text : "";

    try {
      // JSON 배열 추출 (마크다운 코드블록 대비)
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("No JSON array found");
      const parsed: ParsedWine[] = JSON.parse(jsonMatch[0]);

      for (let j = 0; j < batch.length; j++) {
        results.push({
          input: batch[j],
          parsed: parsed[j] ?? {
            winery: null,
            brand: null,
            grape: null,
            region: null,
            classification: null,
          },
          raw: text,
        });
      }
    } catch (e) {
      console.error(`  ⚠ Parse error in batch ${batchNum}:`, (e as Error).message);
      console.error(`  Raw response: ${text.slice(0, 200)}`);
      for (const w of batch) {
        results.push({
          input: w,
          parsed: { winery: null, brand: null, grape: null, region: null, classification: null },
          raw: text,
        });
      }
    }
  }

  return results;
}

function evaluate(
  results: { input: Wine; parsed: ParsedWine }[]
): void {
  let wineryMatch = 0;
  let wineryTotal = 0;
  let grapeMatch = 0;
  let grapeTotal = 0;
  let brandExtracted = 0;
  let regionMatch = 0;
  let regionTotal = 0;

  console.log("\n========== 결과 샘플 (처음 30건) ==========\n");

  for (let i = 0; i < results.length; i++) {
    const { input, parsed } = results[i];

    if (i < 30) {
      console.log(`[${i + 1}] ${input.name_ko}`);
      if (input.name_en) console.log(`    EN: ${input.name_en}`);
      console.log(`    → winery: ${parsed.winery ?? "(null)"}`);
      console.log(`    → brand:  ${parsed.brand ?? "(null)"}`);
      console.log(`    → grape:  ${parsed.grape ?? "(null)"}`);
      console.log(`    → region: ${parsed.region ?? "(null)"}`);
      console.log(`    → class:  ${parsed.classification ?? "(null)"}`);

      // 기존 데이터와 비교
      if (input.producer_ko) {
        const match = parsed.winery?.includes(input.producer_ko) ||
          input.producer_ko.includes(parsed.winery ?? "---");
        console.log(
          `    📋 producer_ko 비교: DB=[${input.producer_ko}] → LLM=[${parsed.winery}] ${match ? "✅" : "❌"}`
        );
      }
      if (input.grape_variety) {
        console.log(
          `    📋 grape 비교: DB=[${input.grape_variety}] → LLM=[${parsed.grape}]`
        );
      }
      if (input.region) {
        console.log(
          `    📋 region 비교: DB=[${input.region}] → LLM=[${parsed.region}]`
        );
      }
      console.log();
    }

    // 통계
    if (input.producer_ko) {
      wineryTotal++;
      const p = parsed.winery?.toLowerCase() ?? "";
      const db = input.producer_ko.toLowerCase();
      // 양방향 포함 관계면 매칭으로 간주 (표기 차이 허용)
      if (p && (p.includes(db) || db.includes(p) || levenshteinRatio(p, db) > 0.6)) {
        wineryMatch++;
      }
    }

    if (input.grape_variety) {
      grapeTotal++;
      const p = parsed.grape?.toLowerCase() ?? "";
      const db = input.grape_variety.toLowerCase();
      if (p && (p.includes(db) || db.includes(p) || levenshteinRatio(p, db) > 0.5)) {
        grapeMatch++;
      }
    }

    if (input.region) {
      regionTotal++;
      const p = parsed.region?.toLowerCase() ?? "";
      const db = input.region.toLowerCase();
      if (p && (p.includes(db) || db.includes(p) || levenshteinRatio(p, db) > 0.5)) {
        regionMatch++;
      }
    }

    if (parsed.brand) brandExtracted++;
  }

  console.log("========== 검증 요약 ==========\n");
  console.log(`총 와인: ${results.length}건`);
  console.log(
    `winery 매칭: ${wineryMatch}/${wineryTotal} (${((wineryMatch / wineryTotal) * 100).toFixed(1)}%) — DB producer_ko 대비`
  );
  if (grapeTotal > 0) {
    console.log(
      `grape 매칭: ${grapeMatch}/${grapeTotal} (${((grapeMatch / grapeTotal) * 100).toFixed(1)}%) — DB grape_variety 대비`
    );
  }
  if (regionTotal > 0) {
    console.log(
      `region 매칭: ${regionMatch}/${regionTotal} (${((regionMatch / regionTotal) * 100).toFixed(1)}%) — DB region 대비`
    );
  }
  console.log(
    `brand 추출: ${brandExtracted}/${results.length} (${((brandExtracted / results.length) * 100).toFixed(1)}%)`
  );
}

function levenshteinRatio(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return 0;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return 1 - dp[m][n] / Math.max(m, n);
}

async function main() {
  console.log("=== 와인명 구조 분리 PoC ===\n");

  console.log("1. 샘플 수집 중...");
  const wines = await fetchSamples();
  console.log(`   ${wines.length}건 수집 완료\n`);

  console.log("2. LLM 파싱 시작 (Haiku)...\n");
  const client = new Anthropic();
  const results = await parseWineNames(client, wines);

  console.log("\n3. 결과 검증...\n");
  evaluate(results);

  // 전체 결과 JSON 저장
  const outputPath = "/tmp/wine-name-parse-poc.json";
  const { writeFileSync } = await import("fs");
  writeFileSync(
    outputPath,
    JSON.stringify(
      results.map(({ input, parsed }) => ({ input, parsed })),
      null,
      2
    )
  );
  console.log(`\n전체 결과 저장: ${outputPath}`);
}

main().catch(console.error);
