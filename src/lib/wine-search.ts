import { createClient } from "@/lib/supabase/server";
import { GRAPE_OPTIONS } from "@/lib/grapes";

// ── 단어 분류용 사전 ──

const GRAPE_WORDS = new Set<string>();
for (const g of GRAPE_OPTIONS) {
  for (const w of g.toLowerCase().split(/[\s/]+/)) {
    if (w.length >= 2) GRAPE_WORDS.add(w);
  }
}
for (const w of [
  "cabernet", "sauvignon", "merlot", "merleau", "pinot", "noir", "syrah", "shiraz",
  "chardonnay", "riesling", "blanc", "grigio", "gris", "grenache", "tempranillo",
  "sangiovese", "nebbiolo", "zinfandel", "malbec", "viognier", "verdejo",
  "moscato", "muscat", "prosecco", "cava", "brut", "blend",
]) GRAPE_WORDS.add(w);

const REGION_WORDS = new Set([
  "프랑스", "이탈리아", "스페인", "포르투갈", "독일", "오스트리아",
  "미국", "칠레", "아르헨티나", "호주", "뉴질랜드", "남아프리카공화국",
  "조지아", "헝가리", "그리스", "한국",
  "france", "italy", "spain", "portugal", "germany", "austria",
  "usa", "chile", "argentina", "australia", "zealand", "africa",
  "bordeaux", "burgundy", "bourgogne", "champagne", "rhone", "loire",
  "napa", "sonoma", "california", "oregon", "washington",
  "tuscany", "toscana", "piedmont", "piemonte", "veneto",
  "rioja", "ribera", "mendoza", "barossa", "marlborough",
  "보르도", "부르고뉴", "샴페인", "론", "루아르", "나파", "소노마",
  "토스카나", "피에몬테", "리오하", "멘도사",
]);

const NOISE_WORDS = new Set([
  "와인", "wine", "레드", "화이트", "로제", "스파클링",
  "red", "white", "rose", "sparkling", "750ml", "ml", "병", "the", "de", "di", "del", "la", "le", "les", "des", "du",
]);

// ── 가중치 ──
const W_BRAND = 1.0;
const W_GRAPE = 0.2;
const W_REGION = 0.15;
const W_VINTAGE = 0.1;

function classifyWord(w: string): number {
  if (NOISE_WORDS.has(w)) return 0;
  if (/^\d{4}$/.test(w)) return W_VINTAGE;
  if (GRAPE_WORDS.has(w)) return W_GRAPE;
  if (REGION_WORDS.has(w)) return W_REGION;
  return W_BRAND;
}

function extractWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['\-''""()[\]{}·,./\\]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

function weightedSimilarity(query: string, target: string): number {
  if (!query || !target) return 0;
  const qNorm = query.toLowerCase().replace(/['\-]/g, " ");
  const tNorm = target.toLowerCase().replace(/['\-]/g, " ");
  if (qNorm === tNorm) return 1;
  if (tNorm.includes(qNorm) || qNorm.includes(tNorm)) return 0.95;

  const qWords = extractWords(query);
  const tWords = extractWords(target);
  if (qWords.length === 0 || tWords.length === 0) return 0;

  let totalWeight = 0;
  let matchedWeight = 0;
  for (const qw of qWords) {
    const weight = classifyWord(qw);
    if (weight === 0) continue;
    totalWeight += weight;
    if (tWords.some((tw) => tw.includes(qw) || qw.includes(tw))) {
      matchedWeight += weight;
    }
  }
  if (totalWeight === 0) return 0;
  const queryCoverage = matchedWeight / totalWeight;

  // 타겟에 쿼리에 없는 단어가 있으면 감점 (다른 와인일 가능성)
  let extraCount = 0;
  for (const tw of tWords) {
    if (classifyWord(tw) === 0) continue;
    if (!qWords.some((qw) => tw.includes(qw) || qw.includes(tw))) {
      extraCount++;
    }
  }
  return Math.max(0, queryCoverage - extraCount * 0.1);
}

interface Scorable {
  name_ko?: string | null;
  name_en?: string | null;
  producer?: string | null;
  producer_ko?: string | null;
  producer_en?: string | null;
}

/**
 * 2단계 병렬 검색: 정확한 패턴 + 넓은 단어 패턴을 동시에 실행 후 합산.
 * 정확한 매칭이 limit에 밀려 누락되는 문제를 원천 차단.
 */
export async function searchWines<T extends Scorable & { id: string }>(
  select: string,
  query: string,
  limit: number,
): Promise<T[]> {
  const supabase = await createClient();

  const exact = `%${query}%`;
  const noSpace = query.replace(/\s+/g, "");
  const fuzzy = "%" + noSpace.split("").join("%") + "%";
  const words = query.split(/[\s']+/).filter((w) => w.length >= 3);
  const wordPatterns = words.slice(0, 4).map((w) => `%${w}%`);

  // 1단계: 정확한 매칭 (이름에 전체 쿼리가 포함되거나, 공백무시 fuzzy)
  const narrowFilter = [
    `name_ko.ilike.${exact}`,
    `name_en.ilike.${exact}`,
    `name_ko.ilike.${fuzzy}`,
    `name_en.ilike.${fuzzy}`,
  ].join(",");

  // 2단계: 넓은 단어 매칭 (개별 단어 3자 이상)
  const broadFilter = wordPatterns.length > 0
    ? wordPatterns.flatMap((p) => [
        `name_ko.ilike.${p}`,
        `name_en.ilike.${p}`,
        `producer.ilike.${p}`,
        `producer_ko.ilike.${p}`,
        `producer_en.ilike.${p}`,
      ]).join(",")
    : null;

  // 병렬 실행
  const narrowQuery = supabase.from("wines").select(select).or(narrowFilter).limit(50);
  const broadQuery = broadFilter
    ? supabase.from("wines").select(select).or(broadFilter).limit(150)
    : null;

  const [narrowResult, broadResult] = await Promise.all([
    narrowQuery,
    broadQuery ?? Promise.resolve({ data: [] as T[] }),
  ]);

  // 합산 + 중복 제거 (narrow 우선)
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const row of [...(narrowResult.data ?? []), ...((broadResult as { data: T[] }).data ?? [])]) {
    const r = row as T;
    if (!seen.has(r.id)) {
      seen.add(r.id);
      merged.push(r);
    }
  }

  return scoreAndFilter(query, merged, limit);
}

/** 가중치 기반 유사도 점수 계산 → 정렬 → 컷오프 필터 적용 */
export function scoreAndFilter<T extends Scorable>(
  query: string,
  data: T[],
  limit: number,
): T[] {
  const scored = data.map((w) => {
    const koScore = weightedSimilarity(query, w.name_ko ?? "");
    const enScore = weightedSimilarity(query, w.name_en ?? "");
    let producerBonus = 0;
    const producers = [w.producer, w.producer_ko, w.producer_en].filter(Boolean);
    for (const p of producers) {
      const pWords = extractWords(p!);
      const qLower = query.toLowerCase();
      if (pWords.some((pw) => qLower.includes(pw))) {
        producerBonus = 0.15;
        break;
      }
    }
    return { item: w, score: Math.max(koScore, enScore) + producerBonus };
  });

  scored.sort((a, b) => b.score - a.score);

  const topScore = scored.length > 0 ? scored[0].score : 0;
  const minScore = Math.max(0.3, topScore * 0.6);

  return scored
    .filter(({ score }) => score >= minScore)
    .slice(0, limit)
    .map(({ item }) => item);
}
