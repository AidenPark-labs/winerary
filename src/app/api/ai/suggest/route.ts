import { createClient } from "@/lib/supabase/server";
import type { WineSuggestion } from "@/types";
import { GRAPE_OPTIONS } from "@/lib/grapes";

// ── 단어 분류용 사전 ──

// 품종명 단어
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

// 지역/국가 단어
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

// 일반 노이즈 (가중치 0)
const NOISE_WORDS = new Set([
  "와인", "wine", "레드", "화이트", "로제", "스파클링",
  "red", "white", "rose", "sparkling", "750ml", "ml", "병", "the", "de", "di", "del", "la", "le", "les", "des", "du",
]);

// ── 가중치 ──
const W_BRAND = 1.0;    // 브랜드/와이너리
const W_GRAPE = 0.2;    // 품종
const W_REGION = 0.15;  // 지역
const W_VINTAGE = 0.1;  // 빈티지

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

// 가중치 기반 유사도: 쿼리 단어가 타겟에 포함되는 비율 (가중치 적용)
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
    if (weight === 0) continue; // noise 무시
    totalWeight += weight;
    if (tWords.some((tw) => tw.includes(qw) || qw.includes(tw))) {
      matchedWeight += weight;
    }
  }
  return totalWeight > 0 ? matchedWeight / totalWeight : 0;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 2) return Response.json({ wines: [] });

  const supabase = await createClient();

  // 검색 패턴: 전체 + 공백무시 + 핵심 단어(3글자 이상)
  const exact = `%${q}%`;
  const noSpace = q.replace(/\s+/g, "");
  const fuzzy = "%" + noSpace.split("").join("%") + "%";
  const words = q.split(/[\s']+/).filter((w) => w.length >= 3);
  const wordPatterns = words.slice(0, 4).map((w) => `%${w}%`);

  const orConditions = [
    `name_ko.ilike.${exact}`,
    `name_en.ilike.${exact}`,
    `name_ko.ilike.${fuzzy}`,
    `name_en.ilike.${fuzzy}`,
    ...wordPatterns.flatMap((p) => [
      `name_ko.ilike.${p}`,
      `name_en.ilike.${p}`,
      `producer.ilike.${p}`,
      `producer_ko.ilike.${p}`,
      `producer_en.ilike.${p}`,
    ]),
  ];

  const { data } = await supabase
    .from("wines")
    .select("id, name_ko, name_en, wine_type, country, grape_variety, producer, producer_ko, producer_en, price, vivino_url, vivino_rating")
    .or(orConditions.join(","))
    .limit(30);

  // 가중치 기반 유사도 정렬
  const scored = (data ?? []).map((w) => {
    // 이름 매칭 (브랜드+와인명 포함)
    const koScore = weightedSimilarity(q, w.name_ko ?? "");
    const enScore = weightedSimilarity(q, w.name_en ?? "");
    // producer 매칭 보너스: 쿼리에 producer가 포함되면 가산
    let producerBonus = 0;
    const producers = [w.producer, w.producer_ko, w.producer_en].filter(Boolean);
    for (const p of producers) {
      const pWords = extractWords(p!);
      const qLower = q.toLowerCase();
      if (pWords.some((pw) => qLower.includes(pw))) {
        producerBonus = 0.15;
        break;
      }
    }
    return { w, score: Math.max(koScore, enScore) + producerBonus };
  });
  scored.sort((a, b) => b.score - a.score);

  // 유사도 필터: 최고 점수의 60% 미만이거나 0.3 미만인 결과 제외
  const topScore = scored.length > 0 ? scored[0].score : 0;
  const minScore = Math.max(0.3, topScore * 0.6);
  const filtered = scored.filter(({ score }) => score >= minScore);

  const wines: WineSuggestion[] = filtered.slice(0, 10).map(({ w }) => ({
    wine_id: w.id,
    name: w.name_en ?? w.name_ko,
    name_ko: w.name_ko,
    producer: w.producer ?? "",
    country: w.country ?? "",
    type: w.wine_type ?? "",
    grapes: w.grape_variety ?? "",
    vintage_range: "",
    vivino_url: w.vivino_url ?? `https://www.vivino.com/search/wines?q=${encodeURIComponent(w.name_en ?? w.name_ko)}`,
  }));

  return Response.json({ wines });
}
