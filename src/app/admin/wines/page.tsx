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
    query = query.or(`name_ko.ilike.%${q}%,name_en.ilike.%${q}%,producer.ilike.%${q}%,country.ilike.%${q}%,grape_variety.ilike.%${q}%`);
  }
  if (type && type !== "all") {
    query = query.eq("wine_type", type);
  }

  const { data: wines, count } = await query.range(from, to);

  const totalCount = count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return <WinesClient wines={wines ?? []} totalCount={totalCount} page={page} totalPages={totalPages} search={q ?? ""} filterType={type ?? "all"} />;
}
