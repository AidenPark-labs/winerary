"use client";

import { deleteWineRecord } from "@/lib/actions/diary";

export default function DeleteButton({ id }: { id: string }) {
  async function handleDelete() {
    if (!confirm("이 기록을 삭제하시겠습니까?")) return;
    await deleteWineRecord(id);
  }

  return (
    <button
      onClick={handleDelete}
      className="text-sm text-zinc-500 hover:text-rose-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-rose-950/40"
    >
      삭제
    </button>
  );
}
