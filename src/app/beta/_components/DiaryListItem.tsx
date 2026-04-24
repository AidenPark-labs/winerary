import Image from "next/image";
import { ChevronRight, BookOpen, Users } from "lucide-react";
import type { MockDiary } from "../_mock/diaries";

export default function DiaryListItem({ diary }: { diary: MockDiary }) {
  return (
    <button
      type="button"
      className="w-full flex items-center gap-3 p-3 rounded-[14px] text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] hover:brightness-105"
      style={{
        background: "var(--gradient-card)",
        backdropFilter: "blur(20px) saturate(1.3)",
        WebkitBackdropFilter: "blur(20px) saturate(1.3)",
        border: "1px solid var(--glass-border)",
        boxShadow: "inset 0 1px 0 var(--glass-highlight)",
      }}
    >
      <div className="relative w-14 h-14 rounded-[10px] overflow-hidden bg-[var(--surface-alt)] shrink-0">
        <Image src={diary.cover} alt="" fill className="object-cover" unoptimized />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <BookOpen size={14} strokeWidth={2} className="text-[var(--accent)]" />
          <span className="text-[15px] font-semibold text-[var(--foreground)] truncate">{diary.name}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--text-muted)]">
          {diary.memberCount ? (
            <span className="inline-flex items-center gap-0.5">
              <Users size={12} /> {diary.memberCount}명
            </span>
          ) : null}
          <span>기록 {diary.recordCount}</span>
          <span>·</span>
          <span>{diary.lastActivity}</span>
        </div>
      </div>
      <ChevronRight size={18} className="text-[var(--text-muted)] shrink-0" />
    </button>
  );
}
