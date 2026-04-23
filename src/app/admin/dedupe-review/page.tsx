import { requireAdmin } from "@/lib/admin";
import ReviewClient, { type DedupeCandidate } from "./ReviewClient";

const BATCH_SIZE = 50;

export default async function DedupeReviewPage() {
  const { supabase } = await requireAdmin();

  // pending 카운트 (배지용)
  const { count: pendingCount } = await supabase
    .from("wine_dedupe_candidates")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  // pending 후보 + 양쪽 와인 상세 조인
  const { data } = await supabase
    .from("wine_dedupe_candidates")
    .select(`
      id, match_reason, match_score, match_details, status, created_at,
      raw_wine:raw_wines!wine_dedupe_candidates_raw_wine_id_fkey (
        id, source, source_id, name_ko, name_en, producer_ko, producer_en,
        country, region, wine_type, grape_variety, grape_varieties, image_url
      ),
      target_wine:wines!wine_dedupe_candidates_target_wine_id_fkey (
        id, name_ko, name_en, producer_ko, producer_en,
        country, region, wine_type, grape_varieties, image_url
      )
    `)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">와인 중복 검수</h1>
        <p className="text-zinc-500 text-sm mt-1">
          표기 차이로 별개 레코드로 수집된 두 와인이 실제로 같은 와인인지 판단하세요. 같은 와인이면 merge, 다르면 반려.
        </p>
      </div>
      <ReviewClient
        candidates={(data ?? []) as unknown as DedupeCandidate[]}
        pendingCount={pendingCount ?? 0}
      />
    </div>
  );
}
