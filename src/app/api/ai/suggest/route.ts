import { createClient } from "@/lib/supabase/server";
import type { WineSuggestion } from "@/types";

function wordSimilarity(query: string, target: string): number {
  if (!query || !target) return 0;
  const qNorm = query.toLowerCase().replace(/['\-]/g, " ");
  const tNorm = target.toLowerCase().replace(/['\-]/g, " ");
  if (qNorm === tNorm) return 1;
  if (tNorm.includes(qNorm) || qNorm.includes(tNorm)) return 0.9;

  const qWords = qNorm.split(/\s+/).filter((w) => w.length >= 2);
  const tWords = tNorm.split(/\s+/).filter((w) => w.length >= 2);
  if (qWords.length === 0 || tWords.length === 0) return 0;

  // 쿼리 단어 중 타겟에 포함된 비율
  let matchCount = 0;
  for (const qw of qWords) {
    if (tWords.some((tw) => tw.includes(qw) || qw.includes(tw))) matchCount++;
  }
  return matchCount / qWords.length;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 2) return Response.json({ wines: [] });

  const supabase = await createClient();

  // 검색 패턴: 전체 + 핵심 단어(3글자 이상)
  const exact = `%${q}%`;
  const words = q.split(/[\s']+/).filter((w) => w.length >= 3);
  const wordPatterns = words.slice(0, 4).map((w) => `%${w}%`);

  const orConditions = [
    `name_ko.ilike.${exact}`,
    `name_en.ilike.${exact}`,
    ...wordPatterns.flatMap((p) => [`name_ko.ilike.${p}`, `name_en.ilike.${p}`]),
  ];

  const { data } = await supabase
    .from("wines")
    .select("id, name_ko, name_en, wine_type, country, grape_variety, producer, price, vivino_url, vivino_rating")
    .or(orConditions.join(","))
    .limit(30);

  // 서버에서 유사도 정렬
  const scored = (data ?? []).map((w) => {
    const koScore = wordSimilarity(q, w.name_ko ?? "");
    const enScore = wordSimilarity(q, w.name_en ?? "");
    return { w, score: Math.max(koScore, enScore) };
  });
  scored.sort((a, b) => b.score - a.score);

  // 유사도 0.3 미만 제외
  const filtered = scored.filter(({ score }) => score >= 0.3);

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
