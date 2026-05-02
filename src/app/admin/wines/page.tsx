import { requireAdmin } from "@/lib/admin";
import WinesClient from "./WinesClient";

const PAGE_SIZE = 200;

export default async function AdminWinesPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; type?: string; vivino?: string }> }) {
  const { page: pageStr, q, type, vivino } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);
  const { supabase: admin } = await requireAdmin();

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // wines_with_vivino view를 driver로 사용 — 한 쿼리로 Vivino 필터 가능
  let query = admin
    .from("wines_with_vivino")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (q) {
    const fuzzy = q.trim().replace(/\s+/g, "").split("").join("%");
    query = query.or(`name_ko.ilike.%${fuzzy}%,name_en.ilike.%${fuzzy}%,producer.ilike.%${fuzzy}%,country_ko.ilike.%${fuzzy}%`);
  }
  if (type && type !== "all") {
    query = query.eq("wine_type", type);
  }

  // Vivino 필터 (view의 vivino_rating·vivino_url 사용)
  if (vivino === "has_both") {
    query = query.not("vivino_rating", "is", null).not("vivino_url", "is", null);
  } else if (vivino === "has_rating") {
    query = query.not("vivino_rating", "is", null);
  } else if (vivino === "no_rating") {
    query = query.is("vivino_rating", null);
  } else if (vivino === "has_url") {
    query = query.not("vivino_url", "is", null);
  } else if (vivino === "no_url") {
    query = query.is("vivino_url", null);
  }

  const { data: wines, count } = await query.range(from, to);

  const totalCount = count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return <WinesClient wines={wines ?? []} totalCount={totalCount} page={page} totalPages={totalPages} search={q ?? ""} filterType={type ?? "all"} vivinoFilter={vivino ?? "all"} />;
}
