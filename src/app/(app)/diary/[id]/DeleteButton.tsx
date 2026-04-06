"use client";

import { useState } from "react";
import { deleteWineRecord } from "@/lib/actions/diary";

export default function DeleteButton({ id }: { id: string }) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("이 기록을 삭제하시겠습니까?")) return;
    setDeleting(true);
    try {
      await deleteWineRecord(id);
    } catch {
      // redirect()는 내부적으로 에러를 throw하므로 정상 동작
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="text-sm text-zinc-500 hover:text-accent transition-colors px-3 py-1.5 rounded-lg hover:bg-accent/10 disabled:opacity-40"
    >
      {deleting ? "삭제 중…" : "삭제"}
    </button>
  );
}
