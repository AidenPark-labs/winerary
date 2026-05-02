import { requireAdmin } from "@/lib/admin";
import Link from "next/link";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/admin" className="text-lg font-bold text-rose-400">Winerary Admin</Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="text-zinc-400 hover:text-zinc-200 transition-colors">대시보드</Link>
            <Link href="/admin/users" className="text-zinc-400 hover:text-zinc-200 transition-colors">유저</Link>
            <Link href="/admin/records" className="text-zinc-400 hover:text-zinc-200 transition-colors">기록</Link>
            <Link href="/admin/wines" className="text-zinc-400 hover:text-zinc-200 transition-colors">와인 DB</Link>
            <Link href="/admin/raw-wines" className="text-zinc-400 hover:text-zinc-200 transition-colors">raw_wines</Link>
            <Link href="/admin/vivino-review" className="text-zinc-400 hover:text-zinc-200 transition-colors">Vivino 검수</Link>
            <Link href="/admin/dedupe-review" className="text-zinc-400 hover:text-zinc-200 transition-colors">중복 검수</Link>
            <Link href="/admin/wines-v2-review" className="text-zinc-400 hover:text-zinc-200 transition-colors">v5 검수</Link>
            <Link href="/admin/vivino-dup-review" className="text-zinc-400 hover:text-zinc-200 transition-colors">Vivino 중복</Link>
            <Link href="/admin/pending-wines" className="text-zinc-400 hover:text-zinc-200 transition-colors">편입 대기</Link>
            <Link href="/admin/reports" className="text-zinc-400 hover:text-zinc-200 transition-colors">신고</Link>
          </div>
        </div>
        <Link href="/diary" className="text-xs text-zinc-500 hover:text-zinc-300">← 서비스로 돌아가기</Link>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
