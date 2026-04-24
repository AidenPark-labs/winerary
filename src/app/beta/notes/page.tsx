import { Plus, Settings } from "lucide-react";
import DiaryListItem from "../_components/DiaryListItem";
import Button from "../_components/Button";
import { diaries } from "../_mock/diaries";

export default function NotesPage() {
  return (
    <div className="max-w-[640px] mx-auto px-3">
      <header className="flex items-center justify-between pt-5 pb-3">
        <h1 className="text-2xl font-bold tracking-tight">노트</h1>
        <button
          aria-label="설정"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[var(--surface-alt)]"
        >
          <Settings size={20} strokeWidth={1.8} />
        </button>
      </header>

      <p className="text-sm text-[var(--text-muted)] mb-4">
        나의 기록과 함께 쓰는 노트
      </p>

      <div className="flex flex-col gap-2">
        {diaries.map((diary) => (
          <DiaryListItem key={diary.id} diary={diary} />
        ))}
      </div>

      <div className="mt-6">
        <Button variant="accent-soft" full size="md">
          <Plus size={18} strokeWidth={2.2} />
          함께 쓰는 노트 만들기
        </Button>
      </div>

      <div className="mt-8 p-4 rounded-[12px] bg-[var(--surface-alt)]">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">함께 쓰는 노트란?</h3>
        <p className="mt-1.5 text-sm text-[var(--text-muted)] leading-relaxed">
          친구들과 하나의 자리를 함께 기록해요. 같은 와인에 각자의 인상을 남겨보세요.
        </p>
      </div>
    </div>
  );
}
