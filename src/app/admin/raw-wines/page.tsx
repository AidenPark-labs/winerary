import { requireAdmin } from "@/lib/admin";
import RawWinesClient, { type RawWineRow } from "./RawWinesClient";

type SourceFilter = "all" | "wine21" | "winenara" | "gangnam" | "naver_shopping" | "user_submission" | "admin";
type PromoteFilter = "all" | "unpromoted" | "promoted";
type MissingFilter = "all" | "complete" | "missing_name_ko" | "missing_name_en" | "missing_country" | "missing_grape";

const PAGE_SIZE = 100;

export default async function AdminRawWinesPage({
  searchParams,
}: {
  searchParams?: Promise<{ source?: string; promote?: string; missing?: string; page?: string; q?: string }>;
}) {
  const { supabase } = await requireAdmin();
  const sp = (await searchParams) ?? {};

  const source: SourceFilter = ["all", "wine21", "winenara", "gangnam", "naver_shopping", "user_submission", "admin"].includes(sp.source ?? "")
    ? (sp.source as SourceFilter)
    : "all";
  const promote: PromoteFilter = ["all", "unpromoted", "promoted"].includes(sp.promote ?? "")
    ? (sp.promote as PromoteFilter)
    : "unpromoted";
  const missing: MissingFilter = ["all", "complete", "missing_name_ko", "missing_name_en", "missing_country", "missing_grape"].includes(sp.missing ?? "")
    ? (sp.missing as MissingFilter)
    : "all";
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  // 소스별 총 건수 (필터 뱃지)
  const sourceTotals: Record<string, number> = {};
  await Promise.all(
    ["wine21", "winenara", "gangnam", "naver_shopping", "user_submission", "admin"].map(async (s) => {
      const { count } = await supabase
        .from("raw_wines")
        .select("id", { count: "exact", head: true })
        .eq("source", s);
      sourceTotals[s] = count ?? 0;
    }),
  );

  let query = supabase
    .from("raw_wines")
    .select(
      "id, source, source_id, name_ko, name_en, country, region, wine_type, grape_variety, producer_ko, producer_en, image_url, price, promoted_wine_id, collected_at",
      { count: "exact" },
    );

  if (source !== "all") query = query.eq("source", source);
  if (promote === "unpromoted") query = query.is("promoted_wine_id", null);
  else if (promote === "promoted") query = query.not("promoted_wine_id", "is", null);

  if (missing === "missing_name_ko") query = query.is("name_ko", null);
  else if (missing === "missing_name_en") query = query.is("name_en", null);
  else if (missing === "missing_country") query = query.is("country", null);
  else if (missing === "missing_grape") {
    // wine21은 parsed_grape_varieties(payload)라 이 필터로는 잡히지 않음.
    // 단순 grape_variety 컬럼만 기준 (비-wine21 대상으로 유용)
    query = query.is("grape_variety", null);
  } else if (missing === "complete") {
    query = query
      .not("name_ko", "is", null)
      .not("name_en", "is", null)
      .not("country", "is", null);
  }

  if (q) {
    query = query.or(`name_ko.ilike.%${q}%,name_en.ilike.%${q}%`);
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, count } = await query
    .order("collected_at", { ascending: false, nullsFirst: false })
    .range(from, to);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">raw_wines</h1>
          <p className="text-zinc-500 text-sm mt-1">
            수집 staging 테이블. 4필드(name_ko · name_en · country · grape)가 채워지면 승격 가능. 어드민이 결손 필드를 직접 채우거나 신규 추가도 가능.
          </p>
        </div>
      </div>
      <RawWinesClient
        rows={(data ?? []) as RawWineRow[]}
        total={count ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        source={source}
        promote={promote}
        missing={missing}
        q={q}
        sourceTotals={sourceTotals}
      />
    </div>
  );
}
