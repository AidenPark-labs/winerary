import { requireAdmin } from "@/lib/admin";
import { crawlSingleWine, crawlByUrl } from "@/lib/vivino-crawler";

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { wineName, vivinoUrl } = await request.json();

  if (vivinoUrl && typeof vivinoUrl === "string") {
    const result = await crawlByUrl(vivinoUrl.trim());
    return Response.json(result);
  }

  if (wineName && typeof wineName === "string") {
    const result = await crawlSingleWine(wineName.trim());
    return Response.json(result);
  }

  return Response.json({ error: "wineName or vivinoUrl is required" }, { status: 400 });
}
