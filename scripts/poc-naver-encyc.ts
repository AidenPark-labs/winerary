/**
 * 네이버 백과사전 API PoC (50건 샘플)
 *
 * 목적:
 *   - raw_wines (source=wine21) 50건을 네이버 백과사전 API로 검색
 *   - 매칭률, description 품질, thumbnail URL 확인
 *   - 워터마크 여부는 실제 이미지 다운로드 후 수동 검토
 *
 * 실행:
 *   npx tsx scripts/poc-naver-encyc.ts
 */

import { config } from "dotenv";
import { writeFileSync } from "fs";
config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const NAVER_ID = process.env.NAVER_CLIENT_ID!;
const NAVER_SECRET = process.env.NAVER_CLIENT_SECRET!;

if (!NAVER_ID || !NAVER_SECRET) {
  console.error("❌ NAVER_CLIENT_ID/SECRET 필요");
  process.exit(1);
}

const SAMPLE_SIZE = 50;
const SLEEP_MS = 200; // 네이버 API 부하 방지

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface RawWine {
  source_id: string;
  name_ko: string;
  name_en: string | null;
  producer_ko: string | null;
  producer_en: string | null;
}

interface NaverItem {
  title: string;
  link: string;
  description: string;
  thumbnail: string;
}

interface NaverResult {
  total: number;
  items: NaverItem[];
}

// ─── 텍스트 정규화 ────────────────────────────────────────────────────────

function stripTags(s: string): string {
  return s.replace(/<\/?b>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\w가-힣]/g, "").trim();
}

// 두 와인 이름의 유사도 (0~1)
function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  // 토큰 기반 매칭
  const tokensA = a.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
  const tokensB = b.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
  if (tokensA.length === 0) return 0;
  let matched = 0;
  for (const ta of tokensA) {
    if (tokensB.some((tb) => tb.includes(ta) || ta.includes(tb))) matched++;
  }
  return matched / tokensA.length;
}

// ─── Naver API ────────────────────────────────────────────────────────────

async function searchNaver(query: string): Promise<NaverResult> {
  const url = `https://openapi.naver.com/v1/search/encyc.json?query=${encodeURIComponent(query)}&display=5`;
  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": NAVER_ID,
      "X-Naver-Client-Secret": NAVER_SECRET,
    },
  });
  if (!res.ok) {
    throw new Error(`Naver API ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as NaverResult;
}

// ─── thumbnail 접근성 체크 ────────────────────────────────────────────────

async function checkThumbnail(url: string): Promise<{ ok: boolean; status: number; size?: number }> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return {
      ok: res.ok,
      status: res.status,
      size: parseInt(res.headers.get("content-length") || "0", 10),
    };
  } catch {
    return { ok: false, status: 0 };
  }
}

// ─── raw_wines 샘플 ───────────────────────────────────────────────────────

async function fetchSample(): Promise<RawWine[]> {
  // 다양성을 위해 source_id 기반 페이지 + 랜덤 offset
  const offset = Math.floor(Math.random() * 30000);
  const url =
    `${SUPABASE_URL}/rest/v1/raw_wines` +
    `?source=eq.wine21` +
    `&select=source_id,name_ko,name_en,producer_ko,producer_en` +
    `&order=source_id.asc` +
    `&limit=${SAMPLE_SIZE}` +
    `&offset=${offset}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`raw_wines fetch failed: ${res.status}`);
  return (await res.json()) as RawWine[];
}

// ─── 메인 ────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍 네이버 백과사전 API PoC (50건)\n");

  const sample = await fetchSample();
  console.log(`📊 샘플 ${sample.length}건 로드\n`);

  const results: any[] = [];
  let totalHit = 0;
  let exactMatch = 0;
  let highMatch = 0;
  let zeroResult = 0;
  let thumbOk = 0;
  let descMissing = 0;

  for (let i = 0; i < sample.length; i++) {
    const wine = sample[i];
    const query = wine.name_ko;
    process.stdout.write(`[${i + 1}/${sample.length}] ${query.slice(0, 40)}... `);

    try {
      const naver = await searchNaver(query);
      if (naver.total === 0 || naver.items.length === 0) {
        zeroResult++;
        process.stdout.write("❌ 0건\n");
        results.push({ wine, naver_total: 0, items: [] });
        await sleep(SLEEP_MS);
        continue;
      }

      // 첫 결과의 매칭 점수
      const top = naver.items[0];
      const topTitle = stripTags(top.title);
      const score = similarity(query, topTitle);

      totalHit++;
      if (score >= 0.95) exactMatch++;
      if (score >= 0.7) highMatch++;
      if (!top.description || top.description.length < 20) descMissing++;

      // thumbnail 접근성 (첫 5건만)
      let thumb: any = { skipped: true };
      if (i < 5 && top.thumbnail) {
        thumb = await checkThumbnail(top.thumbnail);
        if (thumb.ok) thumbOk++;
      }

      process.stdout.write(`✅ ${naver.total}건, score=${score.toFixed(2)}\n`);

      results.push({
        wine,
        naver_total: naver.total,
        top: {
          title: topTitle,
          description: top.description,
          thumbnail: top.thumbnail,
          link: top.link,
          score,
        },
        thumb_check: thumb,
        all_items: naver.items.map((it) => ({
          title: stripTags(it.title),
          desc_len: it.description.length,
          has_thumb: !!it.thumbnail,
        })),
      });
    } catch (e: any) {
      process.stdout.write(`❌ ${e.message}\n`);
      results.push({ wine, error: e.message });
    }

    await sleep(SLEEP_MS);
  }

  console.log("\n━━━ 결과 요약 ━━━");
  console.log(`샘플:                  ${sample.length}`);
  console.log(`Naver hit (≥1건):      ${totalHit} (${((totalHit / sample.length) * 100).toFixed(0)}%)`);
  console.log(`정확 매칭 (≥0.95):     ${exactMatch} (${((exactMatch / sample.length) * 100).toFixed(0)}%)`);
  console.log(`고품질 매칭 (≥0.70):   ${highMatch} (${((highMatch / sample.length) * 100).toFixed(0)}%)`);
  console.log(`검색 결과 0건:         ${zeroResult} (${((zeroResult / sample.length) * 100).toFixed(0)}%)`);
  console.log(`description 누락/짧음:  ${descMissing}`);
  console.log(`thumbnail HEAD 200 OK: ${thumbOk}/5 샘플`);

  // 실패 케이스 출력
  console.log("\n━━━ 0건 또는 저점수 케이스 ━━━");
  for (const r of results) {
    if (r.naver_total === 0 || (r.top && r.top.score < 0.5)) {
      console.log(`  ${r.wine.name_ko}`);
      if (r.top) console.log(`    → 1위: ${r.top.title} (score=${r.top.score.toFixed(2)})`);
    }
  }

  // 샘플 description 출력 (recognition 품질 검토용)
  console.log("\n━━━ 매칭 성공 샘플 5건 (description) ━━━");
  let shown = 0;
  for (const r of results) {
    if (shown >= 5) break;
    if (r.top && r.top.score >= 0.7 && r.top.description && r.top.description.length >= 20) {
      console.log(`\n  와인: ${r.wine.name_ko}`);
      console.log(`  매칭: ${r.top.title}`);
      console.log(`  설명: ${r.top.description}`);
      console.log(`  썸네일: ${r.top.thumbnail || "(없음)"}`);
      shown++;
    }
  }

  // 전체 결과 JSON 저장
  const outFile = `/tmp/naver-poc-${Date.now()}.json`;
  writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\n📁 전체 결과: ${outFile}`);

  // thumbnail URL 5개 (사용자가 직접 열어볼 수 있게)
  console.log("\n━━━ Thumbnail URL 샘플 (브라우저에서 열어 워터마크 확인) ━━━");
  let thumbCount = 0;
  for (const r of results) {
    if (thumbCount >= 5) break;
    if (r.top && r.top.thumbnail) {
      console.log(`  ${thumbCount + 1}. ${r.top.thumbnail}`);
      thumbCount++;
    }
  }
}

main().catch((e) => {
  console.error("\n❌ 에러:", e);
  process.exit(1);
});
