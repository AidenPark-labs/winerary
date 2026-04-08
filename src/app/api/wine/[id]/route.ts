import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("wines")
    .select("id, name_ko, name_en, wine_type, country, grape_variety, producer, vivino_url")
    .eq("id", id)
    .single();

  if (!data) return NextResponse.json(null, { status: 404 });

  return NextResponse.json({
    wine_id: data.id,
    name: data.name_en ?? data.name_ko,
    name_ko: data.name_ko,
    producer: data.producer ?? "",
    country: data.country ?? "",
    type: data.wine_type ?? "",
    grapes: data.grape_variety ?? "",
    vintage_range: "",
    vivino_url: data.vivino_url ?? "",
  });
}
