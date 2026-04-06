import { requireAdmin } from "@/lib/admin";
import RecordsClient from "./RecordsClient";

export default async function AdminRecordsPage() {
  const { supabase: admin } = await requireAdmin();

  const { data: records } = await admin
    .from("wine_records")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  const userIds = [...new Set((records ?? []).map((r: any) => r.user_id))];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, nickname")
    .in("id", userIds);

  return (
    <RecordsClient
      records={records ?? []}
      profiles={profiles ?? []}
    />
  );
}
