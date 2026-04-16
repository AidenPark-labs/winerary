import type { WineSuggestion } from "@/types";
import { searchWines } from "@/lib/wine-search";

const SELECT = "id, name_ko, name_en, wine_type, country, grape_variety, producer, producer_ko, producer_en, price, vivino_url, vivino_rating";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 2) return Response.json({ wines: [] });

  const filtered = await searchWines(SELECT, q, 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wines: WineSuggestion[] = filtered.map((w: any) => {
    const name = w.name_en ?? w.name_ko ?? "";
    return {
      wine_id: w.id,
      name,
      name_ko: w.name_ko ?? "",
      producer: w.producer ?? "",
      country: w.country ?? "",
      type: w.wine_type ?? "",
      grapes: w.grape_variety ?? "",
      vintage_range: "",
      vivino_url: w.vivino_url ?? `https://www.vivino.com/search/wines?q=${encodeURIComponent(name)}`,
    };
  });

  return Response.json({ wines });
}
