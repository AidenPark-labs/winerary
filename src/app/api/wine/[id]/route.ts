import { createClient } from "@/lib/supabase/server";
import { fetchWineWithVivinoById } from "@/lib/wines-v2-fetch";
import { NextResponse } from "next/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const wine = await fetchWineWithVivinoById(supabase, id);
  if (!wine) return NextResponse.json(null, { status: 404 });

  return NextResponse.json({
    wine_id: wine.id,
    name: wine.name_en ?? wine.name_ko,
    name_ko: wine.name_ko,
    producer: wine.producer ?? "",
    country: wine.country_ko,
    type: wine.wine_type,
    grapes: wine.grape_varieties.join(", "),
    vintage_range: "",
    vivino_url: wine.vivino?.vivino_url ?? "",
  });
}
