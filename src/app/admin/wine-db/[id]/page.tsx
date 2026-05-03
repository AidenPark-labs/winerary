import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import WineDetailClient from "./WineDetailClient";
import { loadWineDetailBundle } from "../detail-data";

export default async function WineDbDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();

  const bundle = await loadWineDetailBundle(supabase, id);

  if (!bundle) {
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

  return (
    <WineDetailClient
      wine={bundle.wine}
      dedupeCandidates={bundle.dedupeCandidates}
      dupGroup={bundle.dupGroup}
      reports={bundle.reports}
    />
  );
}
