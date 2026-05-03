import { requireAdmin } from "@/lib/admin";
import WineDbClient, { type WineRow, type ReviewBadgeMap } from "./WineDbClient";

const PAGE_SIZE = 50;

type ReviewFilter = "all" | "needs_review" | "vivino_unreviewed" | "open_reports" | "pending_dedupe";

export default async function AdminWineDbPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; type?: string; vivino?: string; review?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const q = sp.q?.trim() || "";
  const type = sp.type ?? "all";
  const vivino = sp.vivino ?? "all";
  const review = (sp.review ?? "all") as ReviewFilter;

  const { supabase } = await requireAdmin();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // 1) review 필터가 dedupe/reports면 wine_id 후보를 먼저 모은다
  let restrictWineIds: string[] | null = null;
  if (review === "open_reports") {
    const { data: rows } = await supabase
      .from("wine_reports")
      .select("wine_id")
      .eq("status", "open");
    restrictWineIds = Array.from(new Set((rows ?? []).map((r) => r.wine_id as string)));
    if (restrictWineIds.length === 0) restrictWineIds = ["00000000-0000-0000-0000-000000000000"];
  } else if (review === "pending_dedupe") {
    const { data: rows } = await supabase
      .from("wine_dedupe_candidates")
      .select("target_wine_id")
      .eq("status", "pending");
    restrictWineIds = Array.from(new Set((rows ?? []).map((r) => r.target_wine_id as string)));
    if (restrictWineIds.length === 0) restrictWineIds = ["00000000-0000-0000-0000-000000000000"];
  }

  // 2) 메인 쿼리 (wines_with_vivino view)
  let query = supabase
    .from("wines_with_vivino")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (q) {
    // jamo 분해보다 먼저 단순 ilike 패턴 — search_jamo는 fuzzy하지만 어드민은 정확도 우선
    const escaped = q.replace(/[%_]/g, (m) => `\\${m}`);
    query = query.or(
      `name_ko.ilike.%${escaped}%,name_en.ilike.%${escaped}%,producer.ilike.%${escaped}%,brand.ilike.%${escaped}%`,
    );
  }
  if (type !== "all") query = query.eq("wine_type", type);

  if (vivino === "linked") query = query.not("vivino_url", "is", null);
  else if (vivino === "unlinked") query = query.is("vivino_url", null);
  else if (vivino === "reviewed") query = query.not("vivino_reviewed_at", "is", null);

  if (review === "needs_review") query = query.eq("needs_review", true);
  else if (review === "vivino_unreviewed") {
    query = query.not("vivino_url", "is", null).is("vivino_reviewed_at", null);
  }
  if (restrictWineIds) query = query.in("id", restrictWineIds);

  const { data: rows, count } = await query.range(from, to);
  const wines = (rows ?? []) as WineRow[];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // 3) 검수 배지 보강 (페이지 내 wine_id로만)
  const wineIds = wines.map((w) => w.id);
  const badges: ReviewBadgeMap = {};
  if (wineIds.length > 0) {
    const [reportsRes, dedupeRes, vivinoUrlRes] = await Promise.all([
      supabase
        .from("wine_reports")
        .select("wine_id")
        .in("wine_id", wineIds)
        .eq("status", "open"),
      supabase
        .from("wine_dedupe_candidates")
        .select("target_wine_id")
        .in("target_wine_id", wineIds)
        .eq("status", "pending"),
      // 페이지 내 wines의 vivino_url 중 vivino_url_duplicates에 잡힌 것들
      supabase
        .from("vivino_url_duplicates")
        .select("vivino_url, dup_count")
        .in(
          "vivino_url",
          wines.map((w) => w.vivino_url).filter((u): u is string => !!u),
        ),
    ]);

    for (const id of wineIds) badges[id] = { reports: 0, dedupe: 0, vivinoDup: 0 };
    for (const r of reportsRes.data ?? []) {
      const id = r.wine_id as string;
      if (badges[id]) badges[id].reports += 1;
    }
    for (const r of dedupeRes.data ?? []) {
      const id = r.target_wine_id as string;
      if (badges[id]) badges[id].dedupe += 1;
    }
    const dupCountByUrl = new Map<string, number>();
    for (const r of vivinoUrlRes.data ?? []) {
      dupCountByUrl.set(r.vivino_url as string, r.dup_count as number);
    }
    for (const w of wines) {
      if (w.vivino_url && dupCountByUrl.has(w.vivino_url)) {
        badges[w.id].vivinoDup = dupCountByUrl.get(w.vivino_url)!;
      }
    }
  }

  // 4) 전체 검수 카운트 (필터 옆 배지용 — 무필터 기준 wines 절대값)
  const [allWinesCount, needsReviewCount, vivinoUnreviewedCount, openReportsCount, pendingDedupeCount] =
    await Promise.all([
      supabase.from("wines").select("id", { count: "exact", head: true }),
      supabase.from("wines").select("id", { count: "exact", head: true }).eq("needs_review", true),
      supabase
        .from("wines_with_vivino")
        .select("id", { count: "exact", head: true })
        .not("vivino_url", "is", null)
        .is("vivino_reviewed_at", null),
      supabase.from("wine_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("wine_dedupe_candidates").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);

  return (
    <WineDbClient
      wines={wines}
      badges={badges}
      totalCount={totalCount}
      page={page}
      totalPages={totalPages}
      search={q}
      filterType={type}
      vivinoFilter={vivino}
      reviewFilter={review}
      counts={{
        all: allWinesCount.count ?? 0,
        needs_review: needsReviewCount.count ?? 0,
        vivino_unreviewed: vivinoUnreviewedCount.count ?? 0,
        open_reports: openReportsCount.count ?? 0,
        pending_dedupe: pendingDedupeCount.count ?? 0,
      }}
    />
  );
}
