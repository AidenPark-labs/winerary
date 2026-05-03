import "server-only";
import { type SupabaseClient } from "@supabase/supabase-js";
import type {
  WineDetail,
  DedupeCandidate,
  DupGroupMember,
  ReportRow,
} from "./[id]/WineDetailClient";

export interface WineDetailBundle {
  wine: WineDetail;
  dedupeCandidates: DedupeCandidate[];
  dupGroup: DupGroupMember[];
  reports: ReportRow[];
}

export async function loadWineDetailBundle(
  supabase: SupabaseClient,
  id: string,
): Promise<WineDetailBundle | null> {
  const { data: wine } = await supabase
    .from("wines_with_vivino")
    .select("*")
    .eq("id", id)
    .maybeSingle<WineDetail>();
  if (!wine) return null;

  const [dedupeRes, dupGroupRes, reportsRes] = await Promise.all([
    supabase
      .from("wine_dedupe_candidates")
      .select("id, raw_wine_id, match_reason, match_score, match_details, created_at")
      .eq("target_wine_id", id)
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    wine.vivino_url
      ? supabase
          .from("vivino_wines")
          .select("wine_id")
          .eq("vivino_url", wine.vivino_url)
          .neq("wine_id", id)
      : Promise.resolve({ data: [] as { wine_id: string }[] }),
    supabase
      .from("wine_reports")
      .select(
        "id, user_id, report_type, description, status, created_at, resolved_at, resolved_note",
      )
      .eq("wine_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

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

  const dupWineIds = (dupGroupRes.data ?? []).map((r) => r.wine_id as string);
  const { data: dupWines } = dupWineIds.length
    ? await supabase
        .from("wines")
        .select("id, name_ko, name_en, producer, country_ko, region_ko, source, image_url")
        .in("id", dupWineIds)
    : { data: [] as Array<Record<string, unknown>> };
  const dupGroup = (dupWines ?? []) as unknown as DupGroupMember[];

  return {
    wine,
    dedupeCandidates,
    dupGroup,
    reports: (reportsRes.data ?? []) as ReportRow[],
  };
}
