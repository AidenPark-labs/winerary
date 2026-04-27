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

  // 두 모드의 전체 카운트를 병렬로 조회 (탭 뱃지용)
  const [allCountRes, salvagedCountRes] = await Promise.all([
    supabase
      .from("wines")
      .select("id", { count: "exact", head: true })
      .not("vivino_url", "is", null),
    supabase
      .from("wines")
      .select("id", { count: "exact", head: true })
      .eq("vivino_needs_review", true),
  ]);

  const totalAll = allCountRes.count ?? 0;
  const totalSalvaged = salvagedCountRes.count ?? 0;

  // 모드별 배치 조회
  let winesQuery = supabase
    .from("wines")
    .select(`
      id, name_ko, name_en, wine_type, country, country_ko, region, region_ko,
      grape_variety, grape_varieties, producer, producer_ko, producer_en, winery_en_clean,
      image_url,
      vivino_url, vivino_wine_id, vivino_rating, vivino_reviews,
      vivino_winery, vivino_grapes, vivino_region, vivino_style, vivino_alcohol, vivino_description,
      vivino_needs_review, vivino_reviewed_at
    `);

  if (mode === "salvaged") {
    // SALVAGED 마킹된 건만 (기존 동작 유지)
    winesQuery = winesQuery
      .eq("vivino_needs_review", true)
      .order("id", { ascending: true });
  } else {
    // 전체 매칭 건. 우선순위:
    //   1) 아직 재검수 안 된 건 (reviewed_at IS NULL) — NULLS FIRST
    //   2) 오래 전 검수된 건부터
    winesQuery = winesQuery
      .not("vivino_url", "is", null)
      .order("vivino_reviewed_at", { ascending: true, nullsFirst: true })
      .order("id", { ascending: true });
  }

  const { data: wines } = await winesQuery.limit(BATCH_SIZE);

  // 전체 모드의 "남은 재검수" 계산: 전체 매칭 건 중 reviewed_at이 null인 것
  let pendingInMode = totalSalvaged;
  if (mode === "all") {
    const { count: unreviewedCount } = await supabase
      .from("wines")
      .select("id", { count: "exact", head: true })
      .not("vivino_url", "is", null)
      .is("vivino_reviewed_at", null);
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
        wines={(wines ?? []) as ReviewWine[]}
        pendingInMode={pendingInMode}
        totalAll={totalAll}
        totalSalvaged={totalSalvaged}
      />
    </div>
  );
}
