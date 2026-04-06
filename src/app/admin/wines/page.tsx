import { requireAdmin } from "@/lib/admin";
import WinesClient from "./WinesClient";

const PAGE_SIZE = 200;

export default async function AdminWinesPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; type?: string }> }) {
  const { page: pageStr, q, type } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);
  const { supabase: admin } = await requireAdmin();

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = admin
    .from("wines")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (q) {
    // 각 글자 사이에 %를 넣어 띄어쓰기 차이 무시 (e.g. "무초마스" → "%무%초%마%스%")
    const fuzzy = q.trim().replace(/\s+/g, "").split("").join("%");
    query = query.or(`name_ko.ilike.%${fuzzy}%,name_en.ilike.%${fuzzy}%,producer.ilike.%${fuzzy}%,country.ilike.%${fuzzy}%,grape_variety.ilike.%${fuzzy}%`);
  }
  if (type && type !== "all") {
    query = query.eq("wine_type", type);
  }

  const { data: wines, count } = await query.range(from, to);

  const totalCount = count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return <WinesClient wines={wines ?? []} totalCount={totalCount} page={page} totalPages={totalPages} search={q ?? ""} filterType={type ?? "all"} />;
}
