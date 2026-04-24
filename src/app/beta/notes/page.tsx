"use client";

import { useMemo, useState } from "react";
import { Plus, Settings, BookOpen } from "lucide-react";
import FeedCard from "../_components/FeedCard";
import Button from "../_components/Button";
import { diaries } from "../_mock/diaries";
import { myTimeline } from "../_mock/timeline";

type FilterValue = "all" | "mine" | string; // "all" | "mine" | diaryId

const sections: { key: "today" | "thisWeek" | "lastMonth"; label: string }[] = [
  { key: "today", label: "오늘" },
  { key: "thisWeek", label: "이번 주" },
  { key: "lastMonth", label: "지난달" },
];

export default function NotesPage() {
  const [filter, setFilter] = useState<FilterValue>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return myTimeline;
    if (filter === "mine") return myTimeline.filter((r) => r.diaryId === "d-me");
    return myTimeline.filter((r) => r.diaryId === filter);
  }, [filter]);

  const sharedDiaries = diaries.filter((d) => !d.isPersonal);

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

      {/* filter chips */}
      <nav className="flex gap-2 overflow-x-auto -mx-3 px-3 pb-3">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          전체
        </FilterChip>
        <FilterChip active={filter === "mine"} onClick={() => setFilter("mine")}>
          내 노트
        </FilterChip>
        {sharedDiaries.map((d) => (
          <FilterChip
            key={d.id}
            active={filter === d.id}
            onClick={() => setFilter(d.id)}
            icon={<BookOpen size={13} strokeWidth={2} />}
          >
            {d.name}
          </FilterChip>
        ))}
      </nav>

      {/* timeline */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-base text-[var(--foreground)] font-medium">첫 잔의 기억, 여기서 시작돼요</p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">사진 한 장으로 오늘을 남겨보세요</p>
        </div>
      ) : (
        sections.map((section) => {
          const items = filtered.filter((r) => r.section === section.key);
          if (items.length === 0) return null;
          return (
            <section key={section.key} className="mb-6">
              <h2 className="text-sm font-semibold text-[var(--text-muted)] mb-2 px-1">{section.label}</h2>
              <div className="flex flex-col gap-3">
                {items.map((item) => (
                  <FeedCard
                    key={item.id}
                    item={item}
                    hideAuthor={item.diaryId === "d-me" && item.isMine}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}

      {/* create shared note CTA */}
      <div className="mt-2 mb-6">
        <Button variant="accent-soft" full size="md">
          <Plus size={18} strokeWidth={2.2} />
          함께 쓰는 노트 만들기
        </Button>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-sm font-medium whitespace-nowrap transition-colors shrink-0 ${
        active
          ? "bg-[var(--accent)] text-[var(--primary-on)]"
          : "bg-[var(--surface-alt)] text-[var(--foreground)] hover:bg-[var(--accent-soft)]"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
