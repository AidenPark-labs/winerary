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

  // pending 후보 먼저 로드
  const { data: candidates } = await supabase
    .from("wine_dedupe_candidates")
    .select("id, match_reason, match_score, match_details, status, created_at, raw_wine_id, target_wine_id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  // 양쪽 와인은 별도 IN 쿼리로 수집 (JOIN FK hint 의존도 제거)
  const rawIds = Array.from(new Set((candidates ?? []).map((c) => c.raw_wine_id)));
  const targetIds = Array.from(new Set((candidates ?? []).map((c) => c.target_wine_id)));

  const [rawsRes, targetsRes] = await Promise.all([
    rawIds.length > 0
      ? supabase
          .from("raw_wines")
          .select("id, source, source_id, name_ko, name_en, producer_ko, producer_en, country, region, wine_type, grape_variety, image_url")
          .in("id", rawIds)
      : Promise.resolve({ data: [] as unknown[] }),
    targetIds.length > 0
      ? supabase
          .from("wines_v2")
          .select("id, name_ko, name_en, producer, country_ko, region_ko, wine_type, grape_varieties, image_url, alcohol")
          .in("id", targetIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  type RawMap = Record<string, unknown>;
  type WineMap = Record<string, unknown>;
  const rawMap: RawMap = {};
  for (const r of (rawsRes.data ?? []) as Array<{ id: string }>) rawMap[r.id] = r;
  const winesMap: WineMap = {};
  for (const w of (targetsRes.data ?? []) as Array<{ id: string }>) winesMap[w.id] = w;

  const data = (candidates ?? []).map((c) => ({
    ...c,
    raw_wine: rawMap[c.raw_wine_id] ?? null,
    target_wine: winesMap[c.target_wine_id] ?? null,
  }));

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
