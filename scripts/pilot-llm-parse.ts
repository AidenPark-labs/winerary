/**
 * LLM 와인명 파싱 파일럿 — Haiku 4.5 vs Gemini 2.5 Flash
 *
 * 대상: wine21 source의 match 실패 와인 100건 샘플
 * 입력: name_en + raw_payload.winery_en (이미 분리된 생산자 활용)
 * 출력: brand, grape_varieties[], vintage, wine_style, promotion_text, search_query
 *
 * 실행: npx tsx scripts/pilot-llm-parse.ts
 * 옵션: --limit=50 --only=haiku|gemini
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { withRetry } from "../src/lib/ai/gemini-retry";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
};

const args = process.argv.slice(2);
const LIMIT = parseInt(args.find((a) => a.startsWith("--limit="))?.split("=")[1] || "100", 10);
const ONLY = args.find((a) => a.startsWith("--only="))?.split("=")[1] as "haiku" | "gemini" | undefined;

const BATCH_SIZE = 10;

interface Wine {
  id: string;
  name_en: string;
  name_ko: string | null;
  winery_en: string | null;
  winery_ko: string | null;
}

interface Parsed {
  brand: string | null;
  grape_varieties: string[];
  vintage: number | null;
  wine_style: string | null;
  promotion_text: string | null;
  search_query: string;
}

const EMPTY_PARSE: Parsed = {
  brand: null,
  grape_varieties: [],
  vintage: null,
  wine_style: null,
  promotion_text: null,
  search_query: "",
};

// ─── 샘플 수집 ──────────────────────────────────────────────────────────────

async function fetchSamples(limit: number): Promise<Wine[]> {
  // match 실패 와인 중 무작위 샘플 (id.asc로 편향 방지 위해 여러 offset)
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/raw_wines` +
      `?source=eq.wine21` +
      `&raw_payload->>vivino_fail_step=eq.match` +
      `&name_en=not.is.null` +
      `&select=id,name_en,name_ko,raw_payload` +
      `&order=id.asc` +
      `&limit=${limit}`,
    { headers }
  );
  const rows = (await res.json()) as Array<{
    id: string;
    name_en: string;
    name_ko: string | null;
    raw_payload: Record<string, unknown> | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name_en: r.name_en,
    name_ko: r.name_ko,
    winery_en: (r.raw_payload?.winery_en as string) ?? null,
    winery_ko: (r.raw_payload?.winery_ko as string) ?? null,
  }));
}

// ─── 프롬프트 ──────────────────────────────────────────────────────────────

function buildPrompt(batch: Wine[]): string {
  const list = batch
    .map(
      (w, i) =>
        `${i + 1}. name_en: "${w.name_en}" | winery_en: "${w.winery_en ?? ""}" | name_ko: "${w.name_ko ?? ""}"`
    )
    .join("\n");

  return `당신은 와인 도메인 전문가입니다. 주어진 와인명에서 구조를 추출하세요.

입력에는 이미 winery_en(생산자)이 별도로 제공됩니다. 생산자는 다시 추출할 필요 없습니다.

추출할 필드:
- brand: 큐베/라인/브랜드명 (생산자명 제외한 와인 고유 이름). 예: "Grand Reserve", "Montecrocetta Rufian"
- grape_varieties: 품종 영문명 배열. 이름에 명시된 것만. 예: ["Cabernet Sauvignon"], ["Syrah","Mourvedre"]
- vintage: 빈티지 연도 (정수). 없으면 null
- wine_style: 색/스타일 한 단어. Red/White/Rosé/Sparkling/Dessert/Fortified 중 하나, 모호하면 null
- promotion_text: "한정판", "세일", "세트" 등 마케팅 수식어. 없으면 null
- search_query: **Vivino 검색에 최적화된 축약 쿼리**. winery + 가장 식별력 높은 brand/cuvée 키워드만. 품종·지역·빈티지·일반 단어("Red Wine", "Reserve") 제외. 예:
    name_en="Maule Montecrocetta Rufian Rosso", winery_en="Maule" → "Maule Montecrocetta"
    name_en="McGuigan Hand Made Langhorne Creek Shiraz", winery_en="Mcguigan" → "McGuigan Hand Made Langhorne"
    name_en="Champagne Jules Lassalle Cuvee Special Club Brut Vintage", winery_en="Jules Lassalle" → "Jules Lassalle Special Club"

규칙:
1. 이름에 없는 정보는 추측하지 말 것 (null 또는 빈 배열)
2. brand는 생산자명과 중복되지 않도록. 생산자 이름이 name_en 앞에 있으면 제거
3. search_query는 영문으로, 3~5 단어 권장

JSON 배열로만 응답 (마크다운 없이):
[{"brand":"...","grape_varieties":[...],"vintage":null,"wine_style":"...","promotion_text":null,"search_query":"..."}, ...]

와인 목록:
${list}`;
}

// ─── 파서 ──────────────────────────────────────────────────────────────────

function parseJsonArray(text: string): Parsed[] | null {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as Parsed[];
  } catch {
    return null;
  }
}

// ─── Haiku 호출 ─────────────────────────────────────────────────────────────

interface RunResult {
  parsed: Parsed[];
  inputTokens: number;
  outputTokens: number;
  elapsedMs: number;
  errors: number;
}

async function runHaiku(wines: Wine[]): Promise<RunResult> {
  const client = new Anthropic();
  const parsed: Parsed[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let errors = 0;
  const start = Date.now();

  for (let i = 0; i < wines.length; i += BATCH_SIZE) {
    const batch = wines.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const total = Math.ceil(wines.length / BATCH_SIZE);
    process.stdout.write(`\r  Haiku [${batchNum}/${total}]`);

    try {
      const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        messages: [{ role: "user", content: buildPrompt(batch) }],
      });
      inputTokens += res.usage.input_tokens;
      outputTokens += res.usage.output_tokens;
      const text = res.content[0].type === "text" ? res.content[0].text : "";
      const arr = parseJsonArray(text);
      if (!arr || arr.length !== batch.length) {
        errors++;
        for (const _ of batch) parsed.push({ ...EMPTY_PARSE });
      } else {
        parsed.push(...arr);
      }
    } catch (e) {
      errors++;
      console.error(`\n  Haiku batch ${batchNum} error:`, (e as Error).message);
      for (const _ of batch) parsed.push({ ...EMPTY_PARSE });
    }
  }
  process.stdout.write("\n");

  return {
    parsed,
    inputTokens,
    outputTokens,
    elapsedMs: Date.now() - start,
    errors,
  };
}

// ─── Gemini 호출 ────────────────────────────────────────────────────────────

async function runGemini(wines: Wine[]): Promise<RunResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const parsed: Parsed[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let errors = 0;
  const start = Date.now();

  for (let i = 0; i < wines.length; i += BATCH_SIZE) {
    const batch = wines.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const total = Math.ceil(wines.length / BATCH_SIZE);
    process.stdout.write(`\r  Gemini [${batchNum}/${total}]`);

    try {
      const res = await withRetry(
        () =>
          ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: buildPrompt(batch),
          }),
        4,
        1500
      );
      const u = res.usageMetadata;
      if (u) {
        inputTokens += u.promptTokenCount ?? 0;
        outputTokens += u.candidatesTokenCount ?? 0;
      }
      const text = res.text ?? "";
      const arr = parseJsonArray(text);
      if (!arr || arr.length !== batch.length) {
        errors++;
        for (const _ of batch) parsed.push({ ...EMPTY_PARSE });
      } else {
        parsed.push(...arr);
      }
    } catch (e) {
      errors++;
      console.error(`\n  Gemini batch ${batchNum} error:`, (e as Error).message);
      for (const _ of batch) parsed.push({ ...EMPTY_PARSE });
    }
  }
  process.stdout.write("\n");

  return {
    parsed,
    inputTokens,
    outputTokens,
    elapsedMs: Date.now() - start,
    errors,
  };
}

// ─── 비용 계산 (per M tokens) ─────────────────────────────────────────────

const PRICING = {
  haiku: { input: 0.8, output: 4.0 }, // Haiku 4.5 per M
  gemini: { input: 0.15, output: 0.6 }, // Gemini 2.5 Flash per M
};

function cost(model: "haiku" | "gemini", inTok: number, outTok: number): number {
  return (inTok / 1e6) * PRICING[model].input + (outTok / 1e6) * PRICING[model].output;
}

// ─── 메인 ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🧪 LLM 파일럿 (match 실패 ${LIMIT}건)\n`);

  console.log("1. 샘플 수집 중...");
  const wines = await fetchSamples(LIMIT);
  console.log(`   ${wines.length}건 수집\n`);

  let haiku: RunResult | null = null;
  let gemini: RunResult | null = null;

  if (!ONLY || ONLY === "haiku") {
    console.log("2. Haiku 4.5 실행...");
    haiku = await runHaiku(wines);
  }
  if (!ONLY || ONLY === "gemini") {
    console.log("3. Gemini 2.5 Flash 실행...");
    gemini = await runGemini(wines);
  }

  // 결과 저장
  const outPath = join(tmpdir(), `llm-parse-pilot-${Date.now()}.json`);
  const combined = wines.map((w, i) => ({
    id: w.id,
    name_en: w.name_en,
    name_ko: w.name_ko,
    winery_en: w.winery_en,
    haiku: haiku?.parsed[i] ?? null,
    gemini: gemini?.parsed[i] ?? null,
  }));
  writeFileSync(outPath, JSON.stringify(combined, null, 2));

  // 요약
  console.log("\n========== 요약 ==========\n");
  if (haiku) {
    const c = cost("haiku", haiku.inputTokens, haiku.outputTokens);
    const perWine = c / wines.length;
    const total34k = perWine * 34986;
    console.log(`Haiku 4.5:`);
    console.log(`  tokens: in=${haiku.inputTokens}, out=${haiku.outputTokens}`);
    console.log(`  cost: $${c.toFixed(4)} (${(haiku.elapsedMs / 1000).toFixed(1)}s)`);
    console.log(`  per wine: $${perWine.toFixed(5)}`);
    console.log(`  전체 34,986건 예상: $${total34k.toFixed(2)}`);
    console.log(`  batch 에러: ${haiku.errors}`);
  }
  if (gemini) {
    const c = cost("gemini", gemini.inputTokens, gemini.outputTokens);
    const perWine = c / wines.length;
    const total34k = perWine * 34986;
    console.log(`\nGemini 2.5 Flash:`);
    console.log(`  tokens: in=${gemini.inputTokens}, out=${gemini.outputTokens}`);
    console.log(`  cost: $${c.toFixed(4)} (${(gemini.elapsedMs / 1000).toFixed(1)}s)`);
    console.log(`  per wine: $${perWine.toFixed(5)}`);
    console.log(`  전체 34,986건 예상: $${total34k.toFixed(2)}`);
    console.log(`  batch 에러: ${gemini.errors}`);
  }

  // 샘플 비교 (처음 10건)
  console.log("\n========== 샘플 비교 (처음 10건) ==========\n");
  for (let i = 0; i < Math.min(10, wines.length); i++) {
    const w = wines[i];
    console.log(`[${i + 1}] ${w.name_en}`);
    console.log(`    winery: ${w.winery_en ?? "(none)"}`);
    if (haiku) {
      const p = haiku.parsed[i];
      console.log(`    Haiku  → q="${p.search_query}" brand=${p.brand ?? "-"} grape=[${p.grape_varieties?.join(",") ?? ""}] vintage=${p.vintage ?? "-"} style=${p.wine_style ?? "-"}`);
    }
    if (gemini) {
      const p = gemini.parsed[i];
      console.log(`    Gemini → q="${p.search_query}" brand=${p.brand ?? "-"} grape=[${p.grape_varieties?.join(",") ?? ""}] vintage=${p.vintage ?? "-"} style=${p.wine_style ?? "-"}`);
    }
    console.log();
  }

  console.log(`\n📄 전체 결과: ${outPath}`);
}

main().catch((e) => {
  console.error("\n❌", e);
  process.exit(1);
});
