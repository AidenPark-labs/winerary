import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: record } = await supabase
    .from("wine_records")
    .select("name, wine_name_original, wine_vivino_url, wine_type, wine_vintage, grape_variety, wine_country, wine_id, drunk_at, place_name, location, latitude, longitude")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(record);
}
