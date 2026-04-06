import { requireAdmin } from "@/lib/admin";
import PendingWinesClient from "./PendingWinesClient";

export default async function PendingWinesPage() {
  const { supabase } = await requireAdmin();

  const { data: pendingWines } = await supabase
    .from("pending_wines")
    .select("*, profiles(nickname)")
    .order("record_count", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">편입 대기 와인</h1>
      <PendingWinesClient wines={pendingWines ?? []} />
    </div>
  );
}
