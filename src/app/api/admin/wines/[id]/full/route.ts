import { requireAdmin } from "@/lib/admin";
import { loadWineDetailBundle } from "@/app/admin/wine-db/detail-data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await requireAdmin();
    const { id } = await params;
    const bundle = await loadWineDetailBundle(supabase, id);
    if (!bundle) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json(bundle);
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
}
