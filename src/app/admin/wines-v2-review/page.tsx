import { requireAdmin } from "@/lib/admin";
import ReviewClient from "./ReviewClient";

/**
 * v5 변환 검수 페이지 — wines_v2.needs_review=true 행을 어드민이 처리.
 *
 * 변환 모듈이 모호한 케이스로 마킹한 행 (예: 한글 미커버 producer, 영문 미커버 region).
 * 어드민이 필드 수정 또는 사유 무시 후 승인.
 *
 * 임시 페이지 — Phase 5 swap 후 wines로 통합되면 /admin/wines 일반 편집으로 흡수 예정.
 */
export default async function WinesV2ReviewPage() {
  const { supabase } = await requireAdmin();

  const { data, count, error } = await supabase
    .from("wines")
    .select(
      "id, name_ko, name_en, country_ko, region_ko, producer, grape_varieties, wine_type, wine_style, alcohol, brand, source, needs_review, needs_review_reasons",
      { count: "exact" },
    )
    .eq("needs_review", true)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">v5 변환 검수</h1>
        <p className="text-rose-400">에러: {error.message}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">v5 변환 검수</h1>
      <p className="text-sm text-zinc-400 mb-6">
        wines_v2 backfill 시 변환 모듈이 모호하다고 판단한 케이스. 총 {count ?? 0}건.
      </p>
      <ReviewClient initial={data ?? []} />
    </div>
  );
}
