import { createClient } from "@/lib/supabase/server";
import type { WineSuggestion } from "@/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 2) return Response.json({ wines: [] });

  const supabase = await createClient();

  // 공백 무시 검색 패턴
  const fuzzy = "%" + q.replace(/\s+/g, "").split("").join("%") + "%";
  const exact = `%${q}%`;

  // 핵심 단어 패턴 (3글자 이상 단어 AND 조합)
  const words = q.split(/[\s']+/).filter((w) => w.length >= 3);
  const wordPatterns = words.slice(0, 3).map((w) => `%${w}%`);

  const orConditions = [
    `name_ko.ilike.${exact}`,
    `name_en.ilike.${exact}`,
    `name_ko.ilike.${fuzzy}`,
    `name_en.ilike.${fuzzy}`,
    ...wordPatterns.flatMap((p) => [`name_ko.ilike.${p}`, `name_en.ilike.${p}`]),
  ];

  const { data } = await supabase
    .from("wines")
    .select("id, name_ko, name_en, wine_type, country, grape_variety, producer, price, vivino_url, vivino_rating")
    .or(orConditions.join(","))
    .order("price", { ascending: true, nullsFirst: false })
    .limit(10);

  const wines: WineSuggestion[] = (data ?? []).map((w) => ({
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
