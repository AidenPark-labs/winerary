"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminRecordActions({ recordId, deleted }: { recordId: string; deleted: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleAction(action: "delete" | "restore" | "hard_delete") {
    if (action === "hard_delete" && !confirm("이 기록을 완전히 삭제하시겠습니까? 복구할 수 없습니다.")) return;
    if (action === "delete" && !confirm("이 기록을 삭제하시겠습니까?")) return;

    setLoading(true);
    await fetch("/api/admin/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordId, action }),
    });
    setLoading(false);
    router.refresh();
  }

  if (loading) return <span className="text-xs text-zinc-500">처리 중…</span>;

  return (
    <div className="flex gap-1">
      {deleted ? (
        <>
          <button onClick={() => handleAction("restore")} className="text-xs px-2 py-1 rounded bg-emerald-900/50 text-emerald-400 hover:bg-emerald-900">복원</button>
          <button onClick={() => handleAction("hard_delete")} className="text-xs px-2 py-1 rounded bg-rose-900/50 text-rose-400 hover:bg-rose-900">완전삭제</button>
        </>
      ) : (
        <button onClick={() => handleAction("delete")} className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:text-rose-400">삭제</button>
      )}
    </div>
  );
}
