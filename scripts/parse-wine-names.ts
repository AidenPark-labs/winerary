/**
 * wine21 와인명 LLM 구조 파싱 (Haiku 4.5)
 *
 * 최적화:
 *   - 병렬 워커 (concurrency=5)
 *   - 배치당 20건 LLM 호출
 *   - Few-shot 예시로 system prompt 2500+ 토큰 → prompt caching 활성
 *   - 429/503 시 지수 백오프
 *   - 체크포인트 + resume
 *
 * 출력 필드 (raw_payload에 추가):
 *   parsed_brand, parsed_grape_varieties[], parsed_vintage,
 *   parsed_wine_style, parsed_promotion_text, parsed_search_query,
 *   llm_parsed_at, llm_parsed_by
 *
 * 실행:
 *   NODE_ENV=development npx tsx scripts/parse-wine-names.ts
 *   NODE_ENV=development npx tsx scripts/parse-wine-names.ts --limit=500
 *   NODE_ENV=development npx tsx scripts/parse-wine-names.ts --concurrency=5 --batch=20
 *   NODE_ENV=development npx tsx scripts/parse-wine-names.ts --resume
 *   NODE_ENV=development npx tsx scripts/parse-wine-names.ts --dry-run
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ SUPABASE 환경변수 필요");
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("❌ ANTHROPIC_API_KEY 필요");
  process.exit(1);
}

const HEADERS = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

// ─── CLI ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const argV = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const argF = (n: string) => args.includes(`--${n}`);

const CONCURRENCY = parseInt(argV("concurrency") || "5", 10);
const BATCH_SIZE = parseInt(argV("batch") || "20", 10);
const LIMIT = argV("limit") ? parseInt(argV("limit")!, 10) : Infinity;
const RESUME = argF("resume");
const DRY_RUN = argF("dry-run");
const CHECKPOINT_PATH = join(tmpdir(), "parse-wine-names-checkpoint.json");
const MODEL = "claude-haiku-4-5-20251001";
const DB_FETCH_SIZE = 500; // DB에서 한 번에 가져올 행

const client = new Anthropic();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── 타입 ──────────────────────────────────────────────────────────────────

interface Wine {
  id: string;
  name_en: string;
  name_ko: string | null;
  raw_payload: Record<string, unknown> | null;
  winery_en: string | null;
}

interface Parsed {
  brand: string | null;
  grape_varieties: string[];
  vintage: number | null;
  wine_style: string | null;
  promotion_text: string | null;
  search_query: string;
}

interface Checkpoint {
  lastProcessedId: string | null;
  total: number;
  parsed: number;
  errors: number;
  totalInputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  totalOutputTokens: number;
  startedAt: string;
  updatedAt: string;
}

const EMPTY_PARSE: Parsed = {
  brand: null,
  grape_varieties: [],
  vintage: null,
  wine_style: null,
  promotion_text: null,
  search_query: "",
};

// ─── System 프롬프트 (Few-shot 예시로 2500+ 토큰 → 캐싱 활성) ─────────────

const SYSTEM_PROMPT = `당신은 와인 도메인 전문가입니다. 주어진 와인명에서 구조를 추출하는 작업을 합니다.

[작업 개요]
각 와인은 name_en(영문명), winery_en(이미 분리된 생산자명), name_ko(한글명) 형태로 주어집니다. 여기서 아래 필드들을 추출하세요.

[추출 필드 상세]

1. brand (문자열 or null)
   - 큐베/라인/브랜드명. 생산자명이나 품종, 일반 수식어를 제외한 와인 고유 이름.
   - 이름에 특별한 브랜드명이 없으면 null.
   - 생산자명이 name_en 접두사로 이미 있는 경우, brand에 중복 포함하지 마세요.

2. grape_varieties (문자열 배열)
   - 와인명에 명시된 품종(grape)의 영문명 배열.
   - 복수 품종이면 모두 포함. 예: ["Cabernet Sauvignon","Merlot"].
   - 이름에 품종이 명시되지 않으면 빈 배열 [].
   - 한글명만 있으면 영문으로 변환. 예: "쉬라즈" → "Shiraz", "까베르네 소비뇽" → "Cabernet Sauvignon".

3. vintage (정수 or null)
   - 빈티지 연도 (4자리). 예: 2018, 2019.
   - 와인명에 빈티지가 없으면 null.
   - "NV"(Non-Vintage)는 null.

4. wine_style (문자열 or null)
   - 다음 중 하나: "Red", "White", "Rosé", "Sparkling", "Dessert", "Fortified".
   - 판단 힌트: Rosso/Rouge→Red, Bianco/Blanc→White, Rosé/Rosado→Rosé, Brut/Champagne/Prosecco→Sparkling, Porto/Sherry→Fortified.
   - 모호하면 null.

5. promotion_text (문자열 or null)
   - "[한정판]", "세일", "[베스트]" 같은 마케팅/프로모션 수식어.
   - 괄호 안 태그나 한글 광고문구가 포함된 경우 추출.
   - 없으면 null.

6. search_query (문자열, 3~5 단어 권장)
   - **Vivino 검색에 최적화된 축약 쿼리**. 이 필드가 가장 중요합니다.
   - 포함: winery_en의 핵심 단어 + 가장 식별력 높은 brand/큐베 키워드.
   - 제외: 품종명(Shiraz, Cabernet 등), 지역명(Napa, Alba 등), 등급(Grand Cru, Superiore 등), 일반 단어(Red Wine, Reserve, Vintage, Brut, Dry, Domaine(이 혼자 서 있으면), Maison, Chateau(이 혼자 서 있으면) 등), 빈티지 숫자.
   - 영문으로 작성. 악센트 문자(é, ñ, ç 등)는 유지.
   - 비어 있으면 안 됨. 최소 winery_en이라도 포함.

[예시]

예시 1 (생산자 중복 제거):
Input:
  name_en: "Maule Montecrocetta Rufian Rosso"
  winery_en: "Maule"
  name_ko: "마울레 몬테크로체타 루피안 로쏘"
Output:
  {"brand":"Montecrocetta Rufian","grape_varieties":[],"vintage":null,"wine_style":"Red","promotion_text":null,"search_query":"Maule Montecrocetta"}
이유: 생산자 "Maule"이 name_en 접두사이므로 brand에서 제거. "Rosso"는 이탈리아어로 Red 색상 → brand/query 제외. search_query는 간결하게.

예시 2 (품종 분리):
Input:
  name_en: "Field Day Monterra Pinot Grigio"
  winery_en: "Field Day Wine Co."
  name_ko: "필드데이 몬테라 피노 그리지오"
Output:
  {"brand":"Monterra","grape_varieties":["Pinot Grigio"],"vintage":null,"wine_style":"White","promotion_text":null,"search_query":"Field Day Monterra"}
이유: 품종 "Pinot Grigio"는 grape_varieties로 분리. search_query에는 품종 제외하고 생산자+브랜드만.

예시 3 (지역 제거):
Input:
  name_en: "Paulett Missy Polish Hill River Riesling"
  winery_en: "Paulett"
  name_ko: "폴렛 미시 폴리시 힐 리버 리슬링"
Output:
  {"brand":"Missy","grape_varieties":["Riesling"],"vintage":null,"wine_style":"White","promotion_text":null,"search_query":"Paulett Missy"}
이유: "Polish Hill River"는 호주의 지역명이므로 search_query/brand에서 제외. 고유한 큐베명은 "Missy"뿐.

예시 4 (샴페인/수식어 제거):
Input:
  name_en: "Champagne Jules Lassalle Cuvee Special Club Brut Vintage"
  winery_en: "Champagne Jules Lassalle"
  name_ko: "샴페인 쥘 라살 뀌베 스페셜 클럽"
Output:
  {"brand":"Special Club","grape_varieties":[],"vintage":null,"wine_style":"Sparkling","promotion_text":null,"search_query":"Jules Lassalle Special Club"}
이유: "Cuvee", "Brut", "Vintage"는 일반 수식어 → 제외. "Champagne" 접두사도 search_query에서 생략(Jules Lassalle만으로 충분). 고유 큐베 "Special Club"만 brand.

예시 5 (이탈리아 품종+지역 제거):
Input:
  name_en: "Bel Colle Barbera d'Alba Superiore Le Masche"
  winery_en: "Bel Colle"
  name_ko: "벨 콜레 바르베라 달바 수페리오레 레 마스께"
Output:
  {"brand":"Le Masche","grape_varieties":["Barbera"],"vintage":null,"wine_style":"Red","promotion_text":null,"search_query":"Bel Colle Le Masche"}
이유: "Barbera"=품종, "d'Alba"=지역, "Superiore"=등급 모두 제외. 고유 큐베 "Le Masche"만 brand.

예시 6 (단독 와이너리 와인):
Input:
  name_en: "Chateau Margaux 2015"
  winery_en: "Chateau Margaux"
  name_ko: "샤또 마고 2015"
Output:
  {"brand":null,"grape_varieties":[],"vintage":2015,"wine_style":null,"promotion_text":null,"search_query":"Chateau Margaux"}
이유: winery 자체가 와인명, 추가 브랜드 없음. 2015는 vintage로 분리.

예시 7 (프로모션 태그 + 빈티지 + 품종 복합):
Input:
  name_en: "[한정판] Penfolds Grange 2018 Shiraz"
  winery_en: "Penfolds"
  name_ko: "[한정판] 펜폴즈 그란지 2018 쉬라즈"
Output:
  {"brand":"Grange","grape_varieties":["Shiraz"],"vintage":2018,"wine_style":"Red","promotion_text":"한정판","search_query":"Penfolds Grange"}
이유: 대괄호 내부는 promotion_text. vintage는 2018. brand는 Grange만 (Shiraz는 품종).

예시 8 (호주식 이름 + 지역):
Input:
  name_en: "Don't Tell Mum McLaren Vale Shiraz"
  winery_en: "Don't Tell Mum"
  name_ko: "돈 텔 맘 맥라렌 베일 쉬라즈"
Output:
  {"brand":null,"grape_varieties":["Shiraz"],"vintage":null,"wine_style":"Red","promotion_text":null,"search_query":"Don't Tell Mum Shiraz"}
이유: "McLaren Vale"=호주 와인 지역 → 제외. 고유 브랜드 없음 → 품종 "Shiraz"를 search_query에 포함하여 식별력 확보.

예시 9 (부르고뉴 등급 표기):
Input:
  name_en: "Domaine Leflaive Puligny-Montrachet 1er Cru Les Pucelles"
  winery_en: "Domaine Leflaive"
  name_ko: "도멘 르플레브 퓔리니몽라쉐 1er 크뤼 레 퓌셀"
Output:
  {"brand":"Les Pucelles","grape_varieties":[],"vintage":null,"wine_style":"White","promotion_text":null,"search_query":"Leflaive Les Pucelles"}
이유: "Puligny-Montrachet"=지역, "1er Cru"=등급 → 제외. 고유 클리마(단일포도밭) "Les Pucelles"만 brand. search_query에서 "Domaine"은 일반 단어라 생략하고 "Leflaive"만 유지.

예시 10 (스페인, 등급 제외):
Input:
  name_en: "Bodegas Muga Prado Enea Gran Reserva Rioja"
  winery_en: "Bodegas Muga"
  name_ko: "보데가스 무가 프라도 에네아 그란 레세르바 리오하"
Output:
  {"brand":"Prado Enea","grape_varieties":[],"vintage":null,"wine_style":"Red","promotion_text":null,"search_query":"Muga Prado Enea"}
이유: "Gran Reserva"=등급, "Rioja"=지역 → 제외. 고유 큐베 "Prado Enea"가 brand. "Bodegas"는 일반 단어 → search_query에서 "Muga"로 축약.

[출력 형식 엄수]
- JSON 배열 하나만 출력. 마크다운 코드블록(\`\`\`json 등) 절대 금지.
- 입력 와인 순서대로 배열 인덱스 대응.
- 설명, 인사, 사족 절대 금지. 오직 JSON만.
- 형식: [{"brand":"...","grape_varieties":[...],"vintage":null,"wine_style":"...","promotion_text":null,"search_query":"..."}, ...]`;

// ─── DB ────────────────────────────────────────────────────────────────────

async function fetchBatch(afterId: string | null): Promise<Wine[]> {
  // llm_parsed_at이 없는 wine21 대상
  let url =
    `${SUPABASE_URL}/rest/v1/raw_wines` +
    `?source=eq.wine21` +
    `&name_en=not.is.null` +
    `&or=(raw_payload->>llm_parsed_at.is.null,raw_payload.is.null)` +
    `&select=id,name_en,name_ko,raw_payload` +
    `&order=id.asc` +
    `&limit=${DB_FETCH_SIZE}`;
  if (afterId) url += `&id=gt.${afterId}`;

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`fetchBatch ${res.status}`);
  const rows = (await res.json()) as Array<{
    id: string;
    name_en: string;
    name_ko: string | null;
    raw_payload: Record<string, unknown> | null;
  }>;
  return rows.map((r) => ({
    ...r,
    winery_en: (r.raw_payload?.winery_en as string) ?? null,
  }));
}

async function updateRow(wine: Wine, parsed: Parsed): Promise<void> {
  if (DRY_RUN) return;
  const merged = {
    ...(wine.raw_payload || {}),
    parsed_brand: parsed.brand,
    parsed_grape_varieties: parsed.grape_varieties,
    parsed_vintage: parsed.vintage,
    parsed_wine_style: parsed.wine_style,
    parsed_promotion_text: parsed.promotion_text,
    parsed_search_query: parsed.search_query,
    llm_parsed_at: new Date().toISOString(),
    llm_parsed_by: MODEL,
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/raw_wines?id=eq.${wine.id}`, {
    method: "PATCH",
    headers: { ...HEADERS, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ raw_payload: merged }),
  });
  if (!res.ok && res.status < 500) {
    throw new Error(`PATCH ${res.status} (id=${wine.id})`);
  }
}

// ─── LLM 파싱 ──────────────────────────────────────────────────────────────

function buildUserMessage(batch: Wine[]): string {
  const list = batch
    .map(
      (w, i) =>
        `${i + 1}.\n  name_en: "${w.name_en}"\n  winery_en: "${w.winery_en ?? ""}"\n  name_ko: "${w.name_ko ?? ""}"`
    )
    .join("\n");
  return `다음 와인들을 파싱하세요. 배열 길이는 정확히 ${batch.length}이어야 합니다.\n\n${list}`;
}

function parseJsonArray(text: string): Parsed[] | null {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as Parsed[];
  } catch {
    return null;
  }
}

interface LLMResult {
  parsed: Parsed[];
  inputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
}

async function callLLM(batch: Wine[]): Promise<LLMResult> {
  const maxAttempts = 4;
  let attempt = 0;
  let lastErr: Error | null = null;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 3500,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: buildUserMessage(batch) }],
      });

      const text = res.content[0].type === "text" ? res.content[0].text : "";
      const arr = parseJsonArray(text);
      if (!arr || arr.length !== batch.length) {
        throw new Error(
          `JSON 파싱 실패 (arr=${arr?.length ?? "null"}, expected=${batch.length}). 응답 일부: ${text.slice(0, 200)}`
        );
      }

      return {
        parsed: arr,
        inputTokens: res.usage.input_tokens,
        cacheCreationTokens: res.usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
        outputTokens: res.usage.output_tokens,
      };
    } catch (e) {
      lastErr = e as Error;
      const msg = lastErr.message;
      const retriable =
        msg.includes("429") ||
        msg.includes("529") ||
        msg.includes("overloaded") ||
        msg.includes("rate_limit") ||
        msg.includes("timeout") ||
        msg.includes("ECONN");
      if (!retriable || attempt >= maxAttempts) break;
      const delay = 2000 * Math.pow(2, attempt - 1); // 2s, 4s, 8s
      await sleep(delay);
    }
  }
  throw lastErr ?? new Error("LLM 호출 실패");
}

// ─── 체크포인트 ─────────────────────────────────────────────────────────────

function loadCheckpoint(): Checkpoint {
  if (RESUME && existsSync(CHECKPOINT_PATH)) {
    const cp = JSON.parse(readFileSync(CHECKPOINT_PATH, "utf-8")) as Checkpoint;
    console.log(`📂 체크포인트: ${cp.parsed}건 파싱 완료 (from ${cp.lastProcessedId})`);
    return cp;
  }
  return {
    lastProcessedId: null,
    total: 0,
    parsed: 0,
    errors: 0,
    totalInputTokens: 0,
    totalCacheCreationTokens: 0,
    totalCacheReadTokens: 0,
    totalOutputTokens: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function saveCheckpoint(cp: Checkpoint) {
  cp.updatedAt = new Date().toISOString();
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2));
}

// ─── 비용 계산 ─────────────────────────────────────────────────────────────

const PRICING = {
  input: 0.8, // per M
  cacheCreation: 1.0, // 1.25x input
  cacheRead: 0.08, // 0.1x input
  output: 4.0,
};

function totalCost(cp: Checkpoint): number {
  return (
    (cp.totalInputTokens / 1e6) * PRICING.input +
    (cp.totalCacheCreationTokens / 1e6) * PRICING.cacheCreation +
    (cp.totalCacheReadTokens / 1e6) * PRICING.cacheRead +
    (cp.totalOutputTokens / 1e6) * PRICING.output
  );
}

// ─── 병렬 워커 풀 ───────────────────────────────────────────────────────────

async function processBatch(batch: Wine[], cp: Checkpoint): Promise<void> {
  try {
    const llm = await callLLM(batch);
    cp.totalInputTokens += llm.inputTokens;
    cp.totalCacheCreationTokens += llm.cacheCreationTokens;
    cp.totalCacheReadTokens += llm.cacheReadTokens;
    cp.totalOutputTokens += llm.outputTokens;

    // DB PATCH는 병렬로 (개별 요청)
    await Promise.all(
      batch.map((wine, i) =>
        updateRow(wine, llm.parsed[i] ?? EMPTY_PARSE).catch((e) => {
          console.error(`\n   ⚠ PATCH 실패 id=${wine.id}: ${(e as Error).message}`);
        })
      )
    );
    cp.parsed += batch.length;
  } catch (e) {
    cp.errors += batch.length;
    console.error(`\n   ❌ 배치 실패 (${batch.length}건): ${(e as Error).message}`);
  }
  cp.total += batch.length;
  cp.lastProcessedId = batch[batch.length - 1].id;
}

// ─── 메인 ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("🧬 wine21 LLM 파싱 시작 (Haiku 4.5)");
  console.log(`   CONCURRENCY=${CONCURRENCY}, BATCH=${BATCH_SIZE}, DRY=${DRY_RUN}, RESUME=${RESUME}`);
  if (LIMIT !== Infinity) console.log(`   LIMIT=${LIMIT}`);

  const cp = loadCheckpoint();
  const start = Date.now();
  let processedThisRun = 0;

  while (processedThisRun < LIMIT) {
    const rows = await fetchBatch(cp.lastProcessedId);
    if (rows.length === 0) {
      console.log("\n📭 더 이상 처리할 행 없음");
      break;
    }

    // 남은 LIMIT만큼 자르기
    const remaining = LIMIT === Infinity ? rows.length : Math.min(LIMIT - processedThisRun, rows.length);
    const rowsToProcess = rows.slice(0, remaining);

    // 배치 단위로 쪼개서 병렬 처리
    const batches: Wine[][] = [];
    for (let i = 0; i < rowsToProcess.length; i += BATCH_SIZE) {
      batches.push(rowsToProcess.slice(i, i + BATCH_SIZE));
    }

    // CONCURRENCY 만큼 동시 실행
    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const group = batches.slice(i, i + CONCURRENCY);
      await Promise.all(group.map((b) => processBatch(b, cp)));

      processedThisRun += group.reduce((s, b) => s + b.length, 0);
      saveCheckpoint(cp);

      const elapsed = (Date.now() - start) / 1000;
      const rate = processedThisRun / Math.max(elapsed, 0.1);
      const cost = totalCost(cp);
      const cacheHitRate =
        cp.totalCacheReadTokens + cp.totalCacheCreationTokens > 0
          ? cp.totalCacheReadTokens / (cp.totalCacheReadTokens + cp.totalCacheCreationTokens)
          : 0;
      process.stdout.write(
        `\r  처리=${cp.total} 성공=${cp.parsed} 에러=${cp.errors} ${rate.toFixed(1)}/s 비용=$${cost.toFixed(2)} 캐시hit=${(cacheHitRate * 100).toFixed(0)}%    `
      );

      if (processedThisRun >= LIMIT) break;
    }
  }

  saveCheckpoint(cp);
  const elapsed = (Date.now() - start) / 1000;
  console.log("\n\n🎉 완료");
  console.log(`   처리: ${cp.total}건 (성공 ${cp.parsed}, 에러 ${cp.errors})`);
  console.log(`   소요: ${(elapsed / 60).toFixed(1)}분`);
  console.log(
    `   토큰: input=${cp.totalInputTokens} cache_write=${cp.totalCacheCreationTokens} cache_read=${cp.totalCacheReadTokens} output=${cp.totalOutputTokens}`
  );
  console.log(`   비용: $${totalCost(cp).toFixed(3)}`);
  console.log(`   체크포인트: ${CHECKPOINT_PATH}`);
}

main().catch((e) => {
  console.error("\n❌", e);
  process.exit(1);
});
