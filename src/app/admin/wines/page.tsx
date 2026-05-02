import { requireAdmin } from "@/lib/admin";
import WinesClient from "./WinesClient";

const PAGE_SIZE = 200;

export default async function AdminWinesPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; type?: string; vivino?: string }> }) {
  const { page: pageStr, q, type, vivino } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);
  const { supabase: admin } = await requireAdmin();

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = admin
    .from("wines_v2")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (q) {
    const fuzzy = q.trim().replace(/\s+/g, "").split("").join("%");
    query = query.or(`name_ko.ilike.%${fuzzy}%,name_en.ilike.%${fuzzy}%,producer.ilike.%${fuzzy}%,country_ko.ilike.%${fuzzy}%`);
  }
  if (type && type !== "all") {
    query = query.eq("wine_type", type);
  }

  // Vivino 필터 — vivino_wines wine_id IN으로 처리 (별도 쿼리)
  if (vivino && vivino !== "all") {
    let vivinoWineIds: string[] = [];
    if (vivino === "has_both" || vivino === "has_rating") {
      const { data } = await admin
        .from("vivino_wines")
        .select("wine_id")
        .not("rating", "is", null);
      vivinoWineIds = (data ?? []).map((r) => r.wine_id);
    } else if (vivino === "no_rating" || vivino === "no_url") {
      // wines_v2 중 vivino_wines 없거나 rating 없는 것
      const { data } = await admin.from("vivino_wines").select("wine_id");
      const haveSet = new Set((data ?? []).map((r) => r.wine_id));
      // 인메모리 필터는 너무 무거움. v5에선 매칭 갯수가 적을 때만. 대안: 나중에 처리
      // 일단 단순히 not in으로 작은 케이스만 (생략)
      vivinoWineIds = []; // no-op
      query = query.not("id", "in", `(${[...haveSet].slice(0, 1000).join(",") || "00000000-0000-0000-0000-000000000000"})`);
    } else if (vivino === "has_url") {
      const { data } = await admin.from("vivino_wines").select("wine_id");
      vivinoWineIds = (data ?? []).map((r) => r.wine_id);
    }
    if (vivinoWineIds.length > 0) {
      query = query.in("id", vivinoWineIds);
    }
  }

  const { data: wines, count } = await query.range(from, to);

  const totalCount = count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return <WinesClient wines={wines ?? []} totalCount={totalCount} page={page} totalPages={totalPages} search={q ?? ""} filterType={type ?? "all"} vivinoFilter={vivino ?? "all"} />;
}
