/**
 * wine21 수집본 vs 기존 wines 겹침 분석 (강화 버전)
 *
 * 실행: npx tsx scripts/analyze-wine21-overlap.ts
 *
 * 정규화:
 * - 한국어: 자모 분해 → 된소리/거센소리 그룹화 → 재결합
 *     (ㄱ/ㄲ/ㅋ → ㄱ), (ㄷ/ㄸ/ㅌ → ㄷ), (ㅂ/ㅃ/ㅍ → ㅂ),
 *     (ㅅ/ㅆ → ㅅ), (ㅈ/ㅉ/ㅊ → ㅈ)
 * - 영문: 소문자 + 악센트/특수문자 제거 + 불용어 제거 + 토큰 집합 매칭
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// ─── 한국어 정규화 ──────────────────────────────────────────────────────────

// 자모 분해 + 된소리/거센소리 그룹화
function normKo(s: string | null | undefined): string {
  if (!s) return "";
  let out = "";
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    // 한글 음절 영역: 0xAC00 ~ 0xD7A3
    if (code >= 0xac00 && code <= 0xd7a3) {
      const idx = code - 0xac00;
      const cho = Math.floor(idx / 588);
      const jung = Math.floor((idx % 588) / 28);
      const jong = idx % 28;
      // 초성 그룹화: ㄱ/ㄲ/ㅋ → 0, ㄷ/ㄸ/ㅌ → 3, ㅂ/ㅃ/ㅍ → 7, ㅅ/ㅆ → 9, ㅈ/ㅉ/ㅊ → 12
      // 원래: 0ㄱ 1ㄲ 2ㄴ 3ㄷ 4ㄸ 5ㄹ 6ㅁ 7ㅂ 8ㅃ 9ㅅ 10ㅆ 11ㅇ 12ㅈ 13ㅉ 14ㅊ 15ㅋ 16ㅌ 17ㅍ 18ㅎ
      const choGroup = (
        cho === 1 || cho === 15 ? 0 :  // ㄲ, ㅋ → ㄱ
        cho === 4 || cho === 16 ? 3 :  // ㄸ, ㅌ → ㄷ
        cho === 8 || cho === 17 ? 7 :  // ㅃ, ㅍ → ㅂ
        cho === 10 ? 9 :                // ㅆ → ㅅ
        cho === 13 || cho === 14 ? 12 : // ㅉ, ㅊ → ㅈ
        cho
      );
      const newCode = 0xac00 + choGroup * 588 + jung * 28 + jong;
      out += String.fromCharCode(newCode);
    } else if (/[가-힣]/.test(ch)) {
      out += ch;
    } else if (/[a-zA-Z0-9]/.test(ch)) {
      out += ch.toLowerCase();
    }
    // 그 외 문자(공백, 특수문자)는 무시
  }
  return out;
}

// ─── 영문 정규화 ──────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  // 관사/전치사
  "la", "le", "de", "du", "des", "les", "el", "il", "di", "da", "del",
  "the", "and", "of", "et", "en", "a", "mon", "ma", "au",
  // 품종 (중요: 이게 없으면 "Sauvignon Blanc" 같은 품종만 겹치는 오매칭 폭증)
  "cabernet", "sauvignon", "merlot", "pinot", "noir", "grigio", "gris",
  "chardonnay", "blanc", "blanco", "bianco", "syrah", "shiraz", "malbec",
  "riesling", "tempranillo", "grenache", "sangiovese", "nebbiolo",
  "zinfandel", "chenin", "viognier", "gewurztraminer", "moscato", "muscat",
  "primitivo", "barbera", "dolcetto", "carignan", "mourvedre", "carmenere",
  "gamay", "montepulciano", "trebbiano", "verdejo", "albarino", "glera",
  // 스타일/등급
  "red", "white", "rose", "rosé", "rouge", "tinto", "blanc", "brut",
  "dry", "sweet", "vin", "wine", "reserve", "reserva", "riserva",
  "grand", "cru", "classe", "classico", "superiore", "vintage",
  // 연도 (정규식으로도 걸리지만 안전망)
]);

function normEnFull(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normEnTokens(s: string | null | undefined): Set<string> {
  if (!s) return new Set();
  return new Set(
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
  );
}

// 토큰 집합 Jaccard (common / union, 엄격)
function tokenSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const x of a) if (b.has(x)) common++;
  if (common < 2) return 0; // 최소 2개 공유 토큰 필요
  const union = a.size + b.size - common;
  return common / union;
}

// ─── 데이터 로딩 ───────────────────────────────────────────────────────────

interface WineRow {
  id: string;
  name_ko: string | null;
  name_en: string | null;
  vivino_url?: string | null;
  vivino_page_url?: string | null;
  producer_ko?: string | null;
  producer_en?: string | null;
}

async function fetchAll(
  path: string,
  select: string,
  filter: string
): Promise<WineRow[]> {
  const rows: WineRow[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const r = await fetch(
      `${URL}/rest/v1/${path}?select=${select}${filter}&limit=${PAGE}&offset=${offset}`,
      { headers: H }
    );
    const arr: WineRow[] = await r.json();
    rows.push(...arr);
    if (arr.length < PAGE) break;
    offset += PAGE;
  }
  return rows;
}

// ─── 메인 ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("📥 데이터 로드 중...\n");
  const [existing, wine21] = await Promise.all([
    fetchAll(
      "wines",
      "id,name_ko,name_en,vivino_url,vivino_page_url,producer_ko,producer_en",
      ""
    ),
    fetchAll("raw_wines", "id,name_ko,name_en", "&source=eq.wine21"),
  ]);
  console.log(`기존 wines:      ${existing.length}건`);
  console.log(`wine21 raw_wines: ${wine21.length}건\n`);

  // wine21 인덱스 구축
  const w21KoIndex = new Map<string, WineRow[]>();
  const w21EnIndex = new Map<string, WineRow[]>();
  const w21EnTokenList: Array<{ row: WineRow; tokens: Set<string> }> = [];

  for (const r of wine21) {
    const koKey = normKo(r.name_ko);
    const enKey = normEnFull(r.name_en);
    if (koKey) {
      if (!w21KoIndex.has(koKey)) w21KoIndex.set(koKey, []);
      w21KoIndex.get(koKey)!.push(r);
    }
    if (enKey) {
      if (!w21EnIndex.has(enKey)) w21EnIndex.set(enKey, []);
      w21EnIndex.get(enKey)!.push(r);
    }
    const tokens = normEnTokens(r.name_en);
    if (tokens.size >= 2) w21EnTokenList.push({ row: r, tokens });
  }

  console.log(`📐 인덱스: KO ${w21KoIndex.size} / EN ${w21EnIndex.size} / tokens ${w21EnTokenList.length}\n`);

  // 기존 wines 매칭
  const matched: Array<{ existing: WineRow; wine21: WineRow; via: string }> = [];
  const unmatchedSamples: WineRow[] = [];

  let exactKoHit = 0;
  let exactEnHit = 0;
  let tokenHit = 0;

  for (const e of existing) {
    const koKey = normKo(e.name_ko);
    const enKey = normEnFull(e.name_en);

    // 1. 정규화된 한국어 완전 일치
    const koMatch = koKey ? w21KoIndex.get(koKey)?.[0] : undefined;
    // 2. 정규화된 영문 완전 일치
    const enMatch = enKey ? w21EnIndex.get(enKey)?.[0] : undefined;

    if (koMatch) exactKoHit++;
    if (enMatch) exactEnHit++;

    if (koMatch || enMatch) {
      matched.push({
        existing: e,
        wine21: koMatch ?? enMatch!,
        via: koMatch && enMatch ? "KO+EN" : koMatch ? "KO" : "EN",
      });
      continue;
    }

    // 3. 영문 토큰 fuzzy 매칭 (Jaccard >= 0.7)
    const eTokens = normEnTokens(e.name_en);
    if (eTokens.size >= 2) {
      let best: { row: WineRow; score: number } | null = null;
      for (const w of w21EnTokenList) {
        const sim = tokenSimilarity(eTokens, w.tokens);
        if (sim >= 0.7 && (!best || sim > best.score)) {
          best = { row: w.row, score: sim };
        }
      }
      if (best) {
        tokenHit++;
        matched.push({ existing: e, wine21: best.row, via: `TOKEN(${best.score.toFixed(2)})` });
        continue;
      }
    }

    if (unmatchedSamples.length < 15) unmatchedSamples.push(e);
  }

  // wine21 전용 카운트
  const matchedW21Ids = new Set(matched.map((m) => m.wine21.id));
  const w21OnlyCount = wine21.length - matchedW21Ids.size;

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎯 겹침 분석 (강화 정규화)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`한국어 정규화 일치: ${exactKoHit}건`);
  console.log(`영문 정규화 일치:   ${exactEnHit}건`);
  console.log(`토큰 fuzzy 일치:    ${tokenHit}건 (새로 잡힘)`);
  console.log();
  console.log(`총 매칭:            ${matched.length}/${existing.length} (${((matched.length / existing.length) * 100).toFixed(1)}%)`);
  console.log(`기존 전용 (wine21에 없음): ${existing.length - matched.length}건`);
  console.log(`wine21 전용 (기존에 없음): ${w21OnlyCount}건`);
  console.log(`합집합:                    ${existing.length + w21OnlyCount}건`);

  // ─── B. 매칭된 기존 wines의 상태 분석 ───
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📊 B. 매칭된 기존 wines 상태");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  const matchedExisting = matched.map((m) => m.existing);
  const withVivino = matchedExisting.filter(
    (e) => e.vivino_url || e.vivino_page_url
  ).length;
  const withProducerKo = matchedExisting.filter((e) => e.producer_ko).length;
  const withProducerEn = matchedExisting.filter((e) => e.producer_en).length;
  console.log(`매칭된 기존 wines: ${matchedExisting.length}건`);
  console.log(`  vivino 매칭 있음: ${withVivino} (${((withVivino / matchedExisting.length) * 100).toFixed(0)}%)`);
  console.log(`  producer_ko 있음: ${withProducerKo} (${((withProducerKo / matchedExisting.length) * 100).toFixed(0)}%)`);
  console.log(`  producer_en 있음: ${withProducerEn} (${((withProducerEn / matchedExisting.length) * 100).toFixed(0)}%)`);

  // 기존 전체 대비
  console.log(`\n기존 전체 wines: ${existing.length}건`);
  const allWithVivino = existing.filter((e) => e.vivino_url || e.vivino_page_url).length;
  console.log(`  vivino 매칭 있음: ${allWithVivino} (${((allWithVivino / existing.length) * 100).toFixed(0)}%)`);

  // 토큰 매칭 샘플
  const tokenMatches = matched.filter((m) => m.via.startsWith("TOKEN"));
  if (tokenMatches.length > 0) {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`🔬 토큰 매칭 샘플 (새로 잡힌 ${tokenMatches.length}건 중 10건)`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    tokenMatches.slice(0, 10).forEach((m, i) => {
      console.log(`\n[${i + 1}] ${m.via}`);
      console.log(`  기존 EN: ${m.existing.name_en}`);
      console.log(`  w21  EN: ${m.wine21.name_en}`);
    });
  }

  // 매칭 실패 샘플
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`🔍 매칭 실패 샘플 (15건)`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  unmatchedSamples.forEach((e, i) => {
    console.log(`\n[${i + 1}]`);
    console.log(`  KO: ${e.name_ko}`);
    console.log(`  EN: ${e.name_en}`);
  });
}

main().catch(console.error);
