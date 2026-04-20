/**
 * Phase 1 Step 3: LLM 일괄 영↔한 번역 (Haiku 4.5)
 *
 * 실행: NODE_ENV=development npx tsx scripts/llm-translate-terms.ts [--input=<file>]
 *
 * 입력: backup/v3-phase1-terms-<ts>.json (extract-term-candidates.ts 산출물)
 *       자동으로 가장 최근 파일 선택
 * 출력: backup/v3-phase1-translated-<ts>.json
 *       (term_dict INSERT는 별도 스크립트에서 수행 — 중간 검토 단계)
 *
 * 특징:
 *   - 모델: claude-haiku-4-5-20251001
 *   - 병렬 concurrency=5
 *   - 배치당 50개 용어
 *   - Prompt caching (system prompt)
 *   - style은 화이트리스트 필터링 (단순 용어만, 복합 Vivino 라벨 제외)
 *   - 체크포인트 + resume
 *
 * 출력 형식:
 *   { category: "grape", input: "Cabernet Sauvignon", en: "Cabernet Sauvignon",
 *     ko: "카베르네 소비뇽", aliases: ["까베르네 소비뇽"] }
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("❌ ANTHROPIC_API_KEY 필요");
  process.exit(1);
}

const args = process.argv.slice(2);
const argV = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const argF = (n: string) => args.includes(`--${n}`);

const CONCURRENCY = parseInt(argV("concurrency") || "5", 10);
const BATCH_SIZE = parseInt(argV("batch") || "50", 10);
const LIMIT = argV("limit") ? parseInt(argV("limit")!, 10) : Infinity;
const RESUME = argF("resume");
const DRY_RUN = argF("dry-run");
const MODEL = "claude-haiku-4-5-20251001";

const client = new Anthropic();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Style 화이트리스트 (단순 영문/한글 스타일만) ───
const STYLE_WHITELIST_LOWER = new Set([
  // English basic
  "red", "white", "rose", "rosé",
  "sparkling", "still",
  "dessert", "fortified",
  "champagne", "port", "sherry", "madeira",
  "ice wine", "late harvest",
  "dry", "sweet", "off-dry", "semi-dry", "semi-sweet",
  // 한글 (wine21 유래)
  "레드", "화이트", "로제",
  "스파클링", "스틸",
  "디저트", "주정강화",
  "샴페인", "포트", "셰리", "마데이라",
  "아이스와인",
  "드라이", "스위트",
]);

function isSimpleStyle(term: string): boolean {
  return STYLE_WHITELIST_LOWER.has(term.trim().toLowerCase());
}

// ─── 시스템 프롬프트 (캐시용) ───
const SYSTEM_PROMPT = `당신은 와인 도메인 번역 전문가입니다. 영어/한국어 와인 용어를 양방향으로 번역하는 작업을 합니다.

[작업 개요]
입력은 와인 용어 목록입니다. 각 용어는 영문 또는 한글일 수 있습니다. 카테고리(country, region, grape, style)가 주어집니다.

각 입력에 대해:
- input: 원본 그대로
- en: canonical 영문 표기 (공식/업계 표준)
- ko: 한글 표기 (한국 와인 업계 관용 표기 우선, 없으면 음차)
- aliases: 다른 표기/동의어 배열 (선택)

[번역 규칙]

1. country (국가)
   - 국제 표준 영문 국명 (예: France, Italy, United States)
   - 한글: 통용 표기 (예: 프랑스, 이탈리아, 미국)

2. region (지역/와인산지)
   - 영문: 원어 표기 존중 (예: Bordeaux, Tuscany, Napa Valley)
   - 한글: 한국 와인업계 관용 표기 (예: 보르도, 토스카나, 나파 밸리)
   - 복합 지역명(예: "Burgundy Côte de Nuits")은 그대로 유지
   - aliases: 약칭/다른 표기 (예: 샤또 → 샤토)

3. grape (포도품종)
   - 영문: 표준 품종명 (예: Cabernet Sauvignon, Chardonnay, Pinot Noir)
   - 한글: 한국 와인 커뮤니티 관용 표기 (예: 카베르네 소비뇽, 샤르도네, 피노 누아)
   - aliases: 자주 쓰이는 변형 (예: 까베르네 소비뇽, 까베르네)

4. style (와인 스타일)
   - Red → 레드, White → 화이트, Rosé → 로제, Sparkling → 스파클링
   - Dessert → 디저트, Fortified → 주정강화, Dry → 드라이, Sweet → 스위트
   - Champagne → 샴페인, Port → 포트, Sherry → 셰리

[예시]

입력:
category: grape
terms: ["Cabernet Sauvignon", "Sangiovese", "피노 누아", "말벡"]

출력:
[
  {"input": "Cabernet Sauvignon", "en": "Cabernet Sauvignon", "ko": "카베르네 소비뇽", "aliases": ["까베르네 소비뇽", "까베르네"]},
  {"input": "Sangiovese", "en": "Sangiovese", "ko": "산지오베제", "aliases": ["산조베제"]},
  {"input": "피노 누아", "en": "Pinot Noir", "ko": "피노 누아", "aliases": ["피노누아", "피노 느와르"]},
  {"input": "말벡", "en": "Malbec", "ko": "말벡", "aliases": []}
]

[출력 형식]

반드시 다음 JSON 배열 형식으로만 응답하세요. 다른 설명 금지.
각 용어에 대해 정확히 하나의 객체. 입력 순서 유지.

입력 처리 불가능 시(의미 모호, 단어가 아님 등) 해당 객체는:
{"input": "<원본>", "en": "", "ko": "", "aliases": [], "skip": true}
로 표시하되, 스킵 사유는 aliases 배열 첫 요소로 기록: ["unparseable: <사유>"]`;

// ─── 타입 ───
interface TranslationResult {
  input: string;
  en: string;
  ko: string;
  aliases: string[];
  skip?: boolean;
}

interface Checkpoint {
  completedBatches: number;
  total: number;
  translated: number;
  errors: number;
  totalInputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  totalOutputTokens: number;
  results: Array<TranslationResult & { category: string }>;
  startedAt: string;
  updatedAt: string;
}

function findLatestTermsFile(): string {
  const backupDir = path.join(process.cwd(), "backup");
  const files = fs.readdirSync(backupDir).filter((f) => f.startsWith("v3-phase1-terms-"));
  if (files.length === 0) {
    console.error("❌ backup/ 에 v3-phase1-terms-*.json 파일 없음. extract-term-candidates.ts 먼저 실행.");
    process.exit(1);
  }
  files.sort().reverse();
  return path.join(backupDir, files[0]);
}

async function translateBatch(
  category: string,
  batch: string[],
  retries = 3,
): Promise<{ translations: TranslationResult[]; usage: Anthropic.Usage }> {
  const userPrompt = `category: ${category}\nterms: ${JSON.stringify(batch)}`;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 8192,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userPrompt }],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text block in response");
      }

      // JSON 파싱 (가끔 ```json 코드블록으로 감싸오는 경우 대비)
      let jsonText = textBlock.text.trim();
      const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) jsonText = codeBlockMatch[1].trim();

      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) {
        throw new Error(`Expected array, got ${typeof parsed}`);
      }

      if (parsed.length !== batch.length) {
        console.warn(`  ⚠️ 배치 크기 불일치: input=${batch.length} output=${parsed.length}`);
      }

      return { translations: parsed as TranslationResult[], usage: response.usage };
    } catch (e) {
      const isLastAttempt = attempt === retries - 1;
      const errMsg = e instanceof Error ? e.message : String(e);

      // RateLimit/Overloaded는 백오프
      if (
        e instanceof Anthropic.RateLimitError ||
        e instanceof Anthropic.InternalServerError ||
        errMsg.includes("529") ||
        errMsg.includes("overloaded")
      ) {
        const wait = 1000 * Math.pow(2, attempt);
        console.warn(`  [retry ${attempt + 1}] ${errMsg.slice(0, 80)} — ${wait}ms 대기`);
        await sleep(wait);
        continue;
      }

      if (isLastAttempt) throw e;
      console.warn(`  [retry ${attempt + 1}] ${errMsg.slice(0, 80)}`);
      await sleep(500);
    }
  }
  throw new Error("should not reach");
}

async function main() {
  // ─── 입력 로드 ───
  const inputFile = argV("input") ? path.join(process.cwd(), argV("input")!) : findLatestTermsFile();
  console.log(`📥 입력: ${inputFile}`);

  const rawInput = JSON.parse(fs.readFileSync(inputFile, "utf-8"));
  const termsByCategory = rawInput.terms as {
    country: Array<{ term: string; count: number }>;
    region: Array<{ term: string; count: number }>;
    grape: Array<{ term: string; count: number }>;
    style: Array<{ term: string; count: number }>;
  };

  // style 화이트리스트 필터링
  const originalStyleCount = termsByCategory.style.length;
  termsByCategory.style = termsByCategory.style.filter((t) => isSimpleStyle(t.term));
  console.log(`🔍 style 필터링: ${originalStyleCount}개 → ${termsByCategory.style.length}개 (복합 라벨 제외)`);

  // 번역 대상 수집
  const work: Array<{ category: string; terms: string[] }> = [];
  for (const [cat, list] of Object.entries(termsByCategory)) {
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE).map((x) => x.term);
      work.push({ category: cat, terms: batch });
    }
  }

  const totalTerms = Object.values(termsByCategory).reduce((sum, l) => sum + l.length, 0);
  console.log(`📦 번역 대상: ${totalTerms}개 용어 → ${work.length}개 배치 (concurrency=${CONCURRENCY})`);

  if (DRY_RUN) {
    console.log("(dry-run, API 호출 안 함)");
    console.log(`first batch sample: ${JSON.stringify(work[0]?.terms.slice(0, 5))}`);
    return;
  }

  // ─── 체크포인트 ───
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const checkpointPath = path.join(process.cwd(), "backup", `.v3-phase1-translate-checkpoint.json`);
  let checkpoint: Checkpoint = {
    completedBatches: 0,
    total: work.length,
    translated: 0,
    errors: 0,
    totalInputTokens: 0,
    totalCacheCreationTokens: 0,
    totalCacheReadTokens: 0,
    totalOutputTokens: 0,
    results: [],
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (RESUME && fs.existsSync(checkpointPath)) {
    checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf-8"));
    console.log(`📍 체크포인트에서 재개: ${checkpoint.completedBatches}/${checkpoint.total} 배치 완료`);
  }

  let remainingWork = work.slice(checkpoint.completedBatches);
  if (remainingWork.length > LIMIT) remainingWork = remainingWork.slice(0, LIMIT);

  // ─── 병렬 실행 ───
  const saveCheckpoint = () => {
    checkpoint.updatedAt = new Date().toISOString();
    fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
  };

  let nextIdx = 0;
  let active = 0;
  let done = false;

  await new Promise<void>((resolve, reject) => {
    const spawnNext = () => {
      if (nextIdx >= remainingWork.length && active === 0) {
        done = true;
        resolve();
        return;
      }
      if (nextIdx >= remainingWork.length) return;
      if (active >= CONCURRENCY) return;

      const idx = nextIdx++;
      const job = remainingWork[idx];
      active++;

      (async () => {
        try {
          const { translations, usage } = await translateBatch(job.category, job.terms);
          for (const t of translations) {
            checkpoint.results.push({ ...t, category: job.category });
            checkpoint.translated++;
          }
          checkpoint.totalInputTokens += usage.input_tokens;
          checkpoint.totalOutputTokens += usage.output_tokens;
          checkpoint.totalCacheCreationTokens += usage.cache_creation_input_tokens ?? 0;
          checkpoint.totalCacheReadTokens += usage.cache_read_input_tokens ?? 0;
        } catch (e) {
          checkpoint.errors++;
          const errMsg = e instanceof Error ? e.message : String(e);
          console.error(`  ❌ 배치 실패 [${job.category}, ${job.terms.length}개]: ${errMsg.slice(0, 120)}`);
        } finally {
          checkpoint.completedBatches++;
          active--;
          if (checkpoint.completedBatches % 5 === 0) {
            saveCheckpoint();
            const pct = ((checkpoint.completedBatches / checkpoint.total) * 100).toFixed(1);
            console.log(
              `  진행 ${checkpoint.completedBatches}/${checkpoint.total} (${pct}%) | ` +
                `번역 ${checkpoint.translated} | 에러 ${checkpoint.errors} | ` +
                `cache: ${checkpoint.totalCacheReadTokens.toLocaleString()} read / ${checkpoint.totalCacheCreationTokens.toLocaleString()} create`,
            );
          }
          if (!done) spawnNext();
        }
      })().catch(reject);

      // spawn more in parallel
      if (!done) spawnNext();
    };

    spawnNext();
  });

  saveCheckpoint();

  // ─── 최종 저장 ───
  const outputPath = path.join(process.cwd(), "backup", `v3-phase1-translated-${ts}.json`);
  const output = {
    timestamp: new Date().toISOString(),
    source_file: inputFile,
    model: MODEL,
    stats: {
      total_batches: checkpoint.total,
      completed_batches: checkpoint.completedBatches,
      translated_count: checkpoint.translated,
      errors: checkpoint.errors,
      tokens: {
        input: checkpoint.totalInputTokens,
        output: checkpoint.totalOutputTokens,
        cache_creation: checkpoint.totalCacheCreationTokens,
        cache_read: checkpoint.totalCacheReadTokens,
      },
      cost_estimate_usd: {
        // Haiku 4.5: input $1/M, output $5/M, cache_creation 1.25x input, cache_read 0.1x input
        input: (checkpoint.totalInputTokens * 1.0) / 1_000_000,
        output: (checkpoint.totalOutputTokens * 5.0) / 1_000_000,
        cache_creation: (checkpoint.totalCacheCreationTokens * 1.25) / 1_000_000,
        cache_read: (checkpoint.totalCacheReadTokens * 0.1) / 1_000_000,
      },
    },
    translations: checkpoint.results,
  };
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\n💾 저장: ${outputPath}`);
  console.log(`   ${checkpoint.translated}건 번역, ${checkpoint.errors}건 에러`);
  const totalCost =
    output.stats.cost_estimate_usd.input +
    output.stats.cost_estimate_usd.output +
    output.stats.cost_estimate_usd.cache_creation +
    output.stats.cost_estimate_usd.cache_read;
  console.log(`   💰 예상 비용: $${totalCost.toFixed(4)}`);
  console.log(`   📊 캐시: ${checkpoint.totalCacheReadTokens.toLocaleString()} read / ${checkpoint.totalCacheCreationTokens.toLocaleString()} create`);

  // 체크포인트 파일 정리
  if (fs.existsSync(checkpointPath)) fs.unlinkSync(checkpointPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
