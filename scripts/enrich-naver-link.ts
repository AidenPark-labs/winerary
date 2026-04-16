/**
 * 네이버 백과사전 API로 raw_wines에 naver_link 보강
 *
 * Track C: 외부 링크 수집
 *   - raw_wines (source=wine21) 각 와인의 name_ko로 백과사전 검색
 *   - 매칭 성공 시 link를 raw_payload.naver_link에 저장
 *   - description, thumbnail은 저장하지 않음 (저작권)
 *
 * PoC 결과 (2026-04-12, 50건):
 *   - 매칭률 96%, 정확 매칭(≥0.95) 96%
 *   - 0건 결과 4% → fallback query 사용
 *
 * 일일 한도: 25,000 호출 → 안전 마진 24,500
 * 34,986건 → 2일 소요
 *
 * 실행:
 *   npx tsx scripts/enrich-naver-link.ts                  # 시작 (또는 체크포인트 재개)
 *   npx tsx scripts/enrich-naver-link.ts --limit=100      # 최대 N건만
 *   npx tsx scripts/enrich-naver-link.ts --delay=300      # 요청 간격 ms
 *   npx tsx scripts/enrich-naver-link.ts --min-score=0.7  # 매칭 임계값
 *   npx tsx scripts/enrich-naver-link.ts --dry-run        # DB 저장 안 함
 *   npx tsx scripts/enrich-naver-link.ts --reset          # 체크포인트 초기화
 */

import { config } from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "fs";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const NAVER_ID = process.env.NAVER_CLIENT_ID!;
const NAVER_SECRET = process.env.NAVER_CLIENT_SECRET!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ SUPABASE 환경변수 필요");
  process.exit(1);
}
if (!NAVER_ID || !NAVER_SECRET) {
  console.error("❌ NAVER_CLIENT_ID/SECRET 필요");
  process.exit(1);
}

const CHECKPOINT_PATH = "/tmp/naver_enrich_checkpoint.json";
const DAILY_QUOTA = 24500;
const BATCH_SIZE = 200;

// ─── CLI ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function argFlag(name: string): boolean {
  return args.includes(`--${name}`);
}
function argValue(name: string): string | null {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=")[1] : null;
}

const DRY_RUN = argFlag("dry-run");
const RESET = argFlag("reset");
const MAX_ITEMS = argValue("limit") ? parseInt(argValue("limit")!, 10) : Infinity;
const DELAY_MS = parseInt(argValue("delay") || "200", 10);
const MIN_SCORE = parseFloat(argValue("min-score") || "0.7");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── 타입 ──────────────────────────────────────────────────────────────────

interface RawWine {
  id: string;
  source_id: string;
  name_ko: string;
  name_en: string | null;
  producer_ko: string | null;
  raw_payload: Record<string, unknown> | null;
}

interface NaverItem {
  title: string;
  link: string;
  description: string;
  thumbnail: string;
}

interface Checkpoint {
  lastProcessedId: string | null;
  apiCalls: number;
  matched: number;
  noResult: number;
  lowScore: number;
  errors: number;
  total: number;
  quotaDate: string;
  quotaUsed: number;
  startedAt: string;
  updatedAt: string;
}

// ─── 체크포인트 ─────────────────────────────────────────────────────────────

const today = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

function loadCheckpoint(): Checkpoint {
  if (!RESET && existsSync(CHECKPOINT_PATH)) {
    const cp = JSON.parse(readFileSync(CHECKPOINT_PATH, "utf-8")) as Checkpoint;
    if (cp.quotaDate !== today()) {
      console.log(`📅 새로운 날 — 일일 할당 리셋 (이전: ${cp.quotaDate}, ${cp.quotaUsed}호출)`);
      cp.quotaDate = today();
      cp.quotaUsed = 0;
    }
    console.log(
      `📂 체크포인트: ${cp.total}건 처리, ${cp.matched} 매칭, ${cp.noResult} 0건, ${cp.lowScore} 저점수, 오늘 API ${cp.quotaUsed}호출`
    );
    return cp;
  }
  return {
    lastProcessedId: null,
    apiCalls: 0,
    matched: 0,
    noResult: 0,
    lowScore: 0,
    errors: 0,
    total: 0,
    quotaDate: today(),
    quotaUsed: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function saveCheckpoint(cp: Checkpoint) {
  cp.updatedAt = new Date().toISOString();
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2));
}

// ─── 텍스트 유틸 ────────────────────────────────────────────────────────────

function stripTags(s: string): string {
  return s.replace(/<\/?b>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\w가-힣]/g, "").trim();
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const tokensA = a.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
  const tokensB = b.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
  if (tokensA.length === 0) return 0;
  let matched = 0;
  for (const ta of tokensA) {
    if (tokensB.some((tb) => tb.includes(ta) || ta.includes(tb))) matched++;
  }
  return matched / tokensA.length;
}

// ─── Naver API ──────────────────────────────────────────────────────────────

async function searchNaver(query: string): Promise<{ total: number; items: NaverItem[] }> {
  const url = `https://openapi.naver.com/v1/search/encyc.json?query=${encodeURIComponent(query)}&display=3`;
  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": NAVER_ID,
      "X-Naver-Client-Secret": NAVER_SECRET,
    },
  });
  if (res.status === 429) {
    throw new Error("RATE_LIMIT");
  }
  if (!res.ok) {
    throw new Error(`Naver API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return (await res.json()) as { total: number; items: NaverItem[] };
}

// ─── DB 작업 ────────────────────────────────────────────────────────────────

async function fetchBatch(afterId: string | null): Promise<RawWine[]> {
  let url =
    `${SUPABASE_URL}/rest/v1/raw_wines` +
    `?source=eq.wine21` +
    `&select=id,source_id,name_ko,name_en,producer_ko,raw_payload` +
    `&order=id.asc` +
    `&limit=${BATCH_SIZE}`;

  if (afterId) {
    url += `&id=gt.${afterId}`;
  }

  // 이미 naver_link 있는 행은 스킵
  url += `&or=(raw_payload->>naver_link.is.null,raw_payload.is.null)`;

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`fetchBatch ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as RawWine[];
}

async function updateRawPayload(
  id: string,
  currentPayload: Record<string, unknown> | null,
  patch: Record<string, unknown>,
): Promise<void> {
  if (DRY_RUN) return;

  const merged = { ...(currentPayload || {}), ...patch };

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/raw_wines?id=eq.${id}`,
    {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ raw_payload: merged }),
    }
  );
  if (!res.ok) {
    throw new Error(`PATCH ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

// ─── 매칭 로직 ──────────────────────────────────────────────────────────────

interface MatchResult {
  status: "matched" | "no_result" | "low_score" | "error";
  link?: string;
  score?: number;
  title?: string;
  apiCalls: number;
}

async function matchWine(wine: RawWine): Promise<MatchResult> {
  let apiCalls = 0;

  // 1차 시도: name_ko 전체
  try {
    const r1 = await searchNaver(wine.name_ko);
    apiCalls++;

    if (r1.total > 0 && r1.items.length > 0) {
      const top = r1.items[0];
      const title = stripTags(top.title);
      const score = similarity(wine.name_ko, title);
      if (score >= MIN_SCORE) {
        return { status: "matched", link: top.link, score, title, apiCalls };
      }
    }

    // 2차 시도: name_en (영문명이 있으면)
    if (r1.total === 0 && wine.name_en) {
      await sleep(DELAY_MS);
      const r2 = await searchNaver(wine.name_en);
      apiCalls++;
      if (r2.total > 0 && r2.items.length > 0) {
        const top = r2.items[0];
        const title = stripTags(top.title);
        const score = similarity(wine.name_en, title);
        if (score >= MIN_SCORE) {
          return { status: "matched", link: top.link, score, title, apiCalls };
        }
        return { status: "low_score", score, title, apiCalls };
      }
    }

    // 3차 시도: producer_ko만 (0건 fallback)
    if (r1.total === 0 && wine.producer_ko) {
      await sleep(DELAY_MS);
      const r3 = await searchNaver(wine.producer_ko);
      apiCalls++;
      if (r3.total > 0 && r3.items.length > 0) {
        const top = r3.items[0];
        const title = stripTags(top.title);
        const score = similarity(wine.producer_ko, title);
        if (score >= MIN_SCORE) {
          return { status: "matched", link: top.link, score, title, apiCalls };
        }
      }
      return { status: "no_result", apiCalls };
    }

    if (r1.total === 0) return { status: "no_result", apiCalls };
    return { status: "low_score", apiCalls };
  } catch (e: any) {
    if (e.message === "RATE_LIMIT") throw e;
    return { status: "error", apiCalls };
  }
}

// ─── 메인 ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔗 Naver 백과사전 link 수집 (Track C)");
  console.log(`   DELAY=${DELAY_MS}ms, MIN_SCORE=${MIN_SCORE}, DRY=${DRY_RUN}`);
  if (MAX_ITEMS !== Infinity) console.log(`   LIMIT=${MAX_ITEMS}`);

  const cp = loadCheckpoint();
  const start = Date.now();
  let processed = 0;

  while (processed < MAX_ITEMS) {
    if (cp.quotaUsed >= DAILY_QUOTA) {
      console.log(`\n⏸ 일일 할당 ${DAILY_QUOTA} 도달 — 내일 --resume 으로 재개`);
      break;
    }

    const batch = await fetchBatch(cp.lastProcessedId);
    if (batch.length === 0) {
      console.log(`\n📭 더 이상 처리할 행 없음 — 완료`);
      break;
    }

    for (const wine of batch) {
      if (processed >= MAX_ITEMS) break;
      if (cp.quotaUsed >= DAILY_QUOTA) break;

      try {
        const result = await matchWine(wine);
        cp.apiCalls += result.apiCalls;
        cp.quotaUsed += result.apiCalls;

        if (result.status === "matched" && result.link) {
          await updateRawPayload(wine.id, wine.raw_payload, {
            naver_link: result.link,
            naver_match_score: result.score,
            naver_match_title: result.title,
          });
          cp.matched++;
        } else if (result.status === "no_result") {
          await updateRawPayload(wine.id, wine.raw_payload, { naver_link: "__no_result__" });
          cp.noResult++;
        } else if (result.status === "low_score") {
          await updateRawPayload(wine.id, wine.raw_payload, {
            naver_link: "__low_score__",
            naver_match_score: result.score,
            naver_match_title: result.title,
          });
          cp.lowScore++;
        } else {
          cp.errors++;
        }
      } catch (e: any) {
        if (e.message === "RATE_LIMIT") {
          console.error(`\n⚠ 429 Rate Limit — 60초 대기 후 재개`);
          await sleep(60000);
          continue;
        }
        cp.errors++;
      }

      cp.lastProcessedId = wine.id;
      cp.total++;
      processed++;

      if (processed % 100 === 0) {
        saveCheckpoint(cp);
        const elapsed = (Date.now() - start) / 1000;
        const rate = processed / elapsed;
        const pct = ((cp.matched / Math.max(cp.total, 1)) * 100).toFixed(1);
        process.stdout.write(
          `\r  처리=${cp.total} 매칭=${cp.matched}(${pct}%) 0건=${cp.noResult} 저점수=${cp.lowScore} err=${cp.errors} API=${cp.quotaUsed}/${DAILY_QUOTA} ${rate.toFixed(1)}/s    `
        );
      }

      await sleep(DELAY_MS);
    }

    saveCheckpoint(cp);
  }

  saveCheckpoint(cp);

  const elapsed = (Date.now() - start) / 1000;
  console.log(`\n\n🎉 완료`);
  console.log(`   처리: ${cp.total}건`);
  console.log(`   매칭: ${cp.matched}건 (${((cp.matched / Math.max(cp.total, 1)) * 100).toFixed(1)}%)`);
  console.log(`   0건: ${cp.noResult}, 저점수: ${cp.lowScore}, 에러: ${cp.errors}`);
  console.log(`   API 호출: ${cp.apiCalls}총, 오늘 ${cp.quotaUsed}/${DAILY_QUOTA}`);
  console.log(`   소요: ${elapsed.toFixed(0)}s`);
  console.log(`   체크포인트: ${CHECKPOINT_PATH}`);
}

main().catch((e) => {
  console.error("\n❌", e);
  process.exit(1);
});
