import { requireAdmin } from "@/lib/admin";
import ReviewClient, { type ReviewMode, type ReviewWine } from "./ReviewClient";

const BATCH_SIZE = 50;
const ALLOWED_MODES: ReviewMode[] = ["all", "salvaged"];

export default async function VivinoReviewPage({
  searchParams,
}: {
  searchParams?: Promise<{ mode?: string }>;
}) {
  const { supabase } = await requireAdmin();
  const sp = (await searchParams) ?? {};
  const mode: ReviewMode = ALLOWED_MODES.includes(sp.mode as ReviewMode)
    ? (sp.mode as ReviewMode)
    : "all";

  // 카운트 (탭 뱃지용)
  const [allCountRes, salvagedCountRes] = await Promise.all([
    supabase.from("vivino_wines").select("wine_id", { count: "exact", head: true }),
    supabase
      .from("vivino_wines")
      .select("wine_id", { count: "exact", head: true })
      .eq("needs_review", true),
  ]);
  const totalAll = allCountRes.count ?? 0;
  const totalSalvaged = salvagedCountRes.count ?? 0;

  // 1) vivino_wines 우선순위 조회
  let vQuery = supabase
    .from("vivino_wines")
    .select(
      "wine_id, vivino_url, vivino_wine_id, vivino_name, rating, reviews, winery, grapes, region, style, alcohol, description, allergens, image_url, needs_review, reviewed_at",
    );

  if (mode === "salvaged") {
    vQuery = vQuery.eq("needs_review", true).order("wine_id", { ascending: true });
  } else {
    vQuery = vQuery
      .order("reviewed_at", { ascending: true, nullsFirst: true })
      .order("wine_id", { ascending: true });
  }
  const { data: vivinos } = await vQuery.limit(BATCH_SIZE);

  // 2) 해당 wine_id에 wines_v2 행 조회
  const wineIds = (vivinos ?? []).map((v) => v.wine_id);
  let winesV2: Record<string, any> = {};
  if (wineIds.length > 0) {
    const { data: ws } = await supabase
      .from("wines_v2")
      .select(
        "id, name_ko, name_en, wine_type, country_ko, region_ko, producer, grape_varieties, image_url",
      )
      .in("id", wineIds);
    for (const w of ws ?? []) winesV2[w.id] = w;
  }

  // 3) 합성 — ReviewWine
  const wines: ReviewWine[] = (vivinos ?? [])
    .map((v) => {
      const w = winesV2[v.wine_id];
      if (!w) return null;
      return {
        id: w.id,
        name_ko: w.name_ko,
        name_en: w.name_en,
        wine_type: w.wine_type,
        country_ko: w.country_ko,
        region_ko: w.region_ko,
        producer: w.producer,
        grape_varieties: w.grape_varieties ?? [],
        image_url: w.image_url,
        // vivino 분리된 데이터
        vivino_url: v.vivino_url,
        vivino_wine_id: v.vivino_wine_id,
        vivino_name: v.vivino_name,
        vivino_rating: v.rating,
        vivino_reviews: v.reviews,
        vivino_winery: v.winery,
        vivino_grapes: v.grapes,
        vivino_region: v.region,
        vivino_style: v.style,
        vivino_alcohol: v.alcohol,
        vivino_description: v.description,
        vivino_image_url: v.image_url,
        vivino_needs_review: v.needs_review,
        vivino_reviewed_at: v.reviewed_at,
      } as ReviewWine;
    })
    .filter((w): w is ReviewWine => w !== null);

  let pendingInMode = totalSalvaged;
  if (mode === "all") {
    const { count: unreviewedCount } = await supabase
      .from("vivino_wines")
      .select("wine_id", { count: "exact", head: true })
      .is("reviewed_at", null);
    pendingInMode = unreviewedCount ?? 0;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Vivino 매칭 검수</h1>
        <p className="text-zinc-500 text-sm mt-1">
          좌측은 와이너리 DB의 원본 와인, 우측은 매칭된 Vivino 와인입니다. 매칭이 정확하면 유지, 다른 와인이면 해제하세요.
        </p>
      </div>
      <ReviewClient
        mode={mode}
        wines={wines}
        pendingInMode={pendingInMode}
        totalAll={totalAll}
        totalSalvaged={totalSalvaged}
      />
    </div>
  );
}
