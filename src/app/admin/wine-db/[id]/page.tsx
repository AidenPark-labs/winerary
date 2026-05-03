import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import WineDetailClient, {
  type WineDetail,
  type DedupeCandidate,
  type DupGroupMember,
  type ReportRow,
} from "./WineDetailClient";

export default async function WineDbDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();

  // 1) 와인 본체 (wines_with_vivino view)
  const { data: wine } = await supabase
    .from("wines_with_vivino")
    .select("*")
    .eq("id", id)
    .maybeSingle<WineDetail>();

  if (!wine) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <h1 className="text-xl font-semibold mb-2">와인을 찾을 수 없습니다</h1>
        <p className="text-zinc-500 text-sm font-mono mb-6">{id}</p>
        <Link href="/admin/wine-db" className="text-rose-400 hover:underline">
          ← 목록으로
        </Link>
      </div>
    );
  }

  // 2) 보강 데이터 4종 병렬 로드
  const [dedupeRes, dupGroupRes, reportsRes] = await Promise.all([
    // 이 와인을 target으로 한 dedupe pending 후보
    supabase
      .from("wine_dedupe_candidates")
      .select("id, raw_wine_id, match_reason, match_score, match_details, created_at")
      .eq("target_wine_id", id)
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    // 같은 vivino_url을 공유하는 다른 와인
    wine.vivino_url
      ? supabase
          .from("vivino_wines")
          .select("wine_id")
          .eq("vivino_url", wine.vivino_url)
          .neq("wine_id", id)
      : Promise.resolve({ data: [] as { wine_id: string }[] }),
    // 신고 (open + 최근 처리된 것 모두)
    supabase
      .from("wine_reports")
      .select("id, user_id, report_type, description, status, created_at, resolved_at, resolved_note")
      .eq("wine_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  // 3) dedupe 후보의 raw_wines 보강
  const candidates = (dedupeRes.data ?? []) as Array<{
    id: string;
    raw_wine_id: string;
    match_reason: string;
    match_score: number | null;
    match_details: Record<string, unknown> | null;
    created_at: string;
  }>;
  const rawIds = Array.from(new Set(candidates.map((c) => c.raw_wine_id)));
  const { data: rawWines } = rawIds.length
    ? await supabase
        .from("raw_wines")
        .select(
          "id, source, source_id, name_ko, name_en, producer_ko, producer_en, country, region, wine_type, grape_variety, alcohol, image_url",
        )
        .in("id", rawIds)
    : { data: [] as Array<Record<string, unknown>> };
  const rawMap = new Map<string, Record<string, unknown>>();
  for (const r of rawWines ?? []) rawMap.set((r as { id: string }).id, r);
  const dedupeCandidates: DedupeCandidate[] = candidates.map((c) => ({
    ...c,
    raw_wine: (rawMap.get(c.raw_wine_id) ?? null) as DedupeCandidate["raw_wine"],
  }));

  // 4) 같은 URL 그룹의 다른 와인 정보
  const dupWineIds = (dupGroupRes.data ?? []).map((r) => r.wine_id as string);
  const { data: dupWines } = dupWineIds.length
    ? await supabase
        .from("wines")
        .select("id, name_ko, name_en, producer, country_ko, region_ko, source, image_url")
        .in("id", dupWineIds)
    : { data: [] as Array<Record<string, unknown>> };
  const dupGroup: DupGroupMember[] = (dupWines ?? []) as unknown as DupGroupMember[];

  return (
    <WineDetailClient
      wine={wine}
      dedupeCandidates={dedupeCandidates}
      dupGroup={dupGroup}
      reports={(reportsRes.data ?? []) as ReportRow[]}
    />
  );
}
