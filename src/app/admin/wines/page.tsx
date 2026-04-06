import { requireAdmin } from "@/lib/admin";
import WinesClient from "./WinesClient";

export default async function AdminWinesPage() {
  const { supabase: admin } = await requireAdmin();

  const { data: wines, count } = await admin
    .from("wines")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(200);

  return <WinesClient wines={wines ?? []} totalCount={count ?? 0} />;
}
