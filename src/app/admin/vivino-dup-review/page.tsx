import { requireAdmin } from "@/lib/admin";
import ReviewClient from "./ReviewClient";

/**
 * vivino_url 중복 검수 — 같은 Vivino 와인 페이지를 가리키는 여러 wines 발견.
 *
 * 두 시나리오:
 *   1. 실제로 같은 와인인데 wines가 분리된 경우 → dedupe 필요 (수동 또는 dedupe-review 활용)
 *   2. 잘못 매칭된 경우 → 일부 와인의 vivino를 해제 (vivino_wines DELETE)
 *
 * 어드민이 그룹별로 보고 판단.
 */
export default async function VivinoDupReviewPage() {
  const { supabase } = await requireAdmin();

  // view에서 중복 그룹 조회 (50개)
  const { data: groups, count, error: viewError } = await supabase
    .from("vivino_url_duplicates")
    .select("vivino_url, dup_count, wine_ids, vivino_names", { count: "exact" })
    .order("dup_count", { ascending: false })
    .limit(50);

  if (viewError) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Vivino URL 중복 검수</h1>
        <p className="text-rose-400">에러: {viewError.message}</p>
      </div>
    );
  }

  // 모든 wine_id 모아서 wines_v2 정보 한 번에 조회
  const allWineIds = (groups ?? []).flatMap((g) => g.wine_ids as string[]);
  const { data: wines } = await supabase
    .from("wines")
    .select("id, name_ko, name_en, country_ko, region_ko, producer, source, image_url")
    .in("id", allWineIds.length > 0 ? allWineIds : ["00000000-0000-0000-0000-000000000000"]);

  const wineMap = new Map<string, any>();
  for (const w of wines ?? []) wineMap.set(w.id, w);

  const enriched = (groups ?? []).map((g) => ({
    vivino_url: g.vivino_url as string,
    dup_count: g.dup_count as number,
    wines: (g.wine_ids as string[])
      .map((id) => wineMap.get(id))
      .filter((w): w is NonNullable<typeof w> => Boolean(w)),
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Vivino URL 중복 검수</h1>
      <p className="text-sm text-zinc-400 mb-6">
        같은 Vivino 와인을 가리키는 여러 wines. 총 {count ?? 0}개 그룹 (상위 50 표시).
      </p>
      <ReviewClient initial={enriched} />
    </div>
  );
}
