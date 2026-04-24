"use client";

import { useMemo, useState } from "react";
import { Plus, Bell, BookOpen, Sparkles } from "lucide-react";
import FeedCard from "./_components/FeedCard";
import Button from "./_components/Button";
import { diaries } from "./_mock/diaries";
import { myTimeline } from "./_mock/timeline";
import { pendingFriendRequests, hintCard } from "./_mock/feed";

type FilterValue = "all" | "mine" | string;

const sections: { key: "today" | "thisWeek" | "lastMonth"; label: string }[] = [
  { key: "today", label: "오늘" },
  { key: "thisWeek", label: "이번 주" },
  { key: "lastMonth", label: "지난달" },
];

export default function NotesHomePage() {
  const [filter, setFilter] = useState<FilterValue>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return myTimeline;
    if (filter === "mine") return myTimeline.filter((r) => r.diaryId === "d-me");
    return myTimeline.filter((r) => r.diaryId === filter);
  }, [filter]);

  // 섹션 순서대로 돌며 실제 렌더 첫 카드 id 계산 (hero 변형 대상)
  const firstRenderedId = useMemo(() => {
    for (const s of sections) {
      const first = filtered.find((r) => r.section === s.key);
      if (first) return first.id;
    }
    return null;
  }, [filtered]);

  const sharedDiaries = diaries.filter((d) => !d.isPersonal);

  const showHintAfterSection = "thisWeek"; // 힌트 카드는 이번 주 끝에 간헐적으로

  return (
    <div className="max-w-[640px] mx-auto px-3">
      <header className="flex items-center justify-between pt-5 pb-3">
        <h1 className="text-2xl font-bold tracking-tight">노트</h1>
        <button
          aria-label="알림"
          className="relative w-10 h-10 flex items-center justify-center rounded-full hover:bg-[var(--surface-alt)]"
        >
          <Bell size={20} strokeWidth={1.8} />
          {pendingFriendRequests > 0 ? (
            <span className="absolute top-1.5 right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-[var(--accent)] text-[10px] text-[var(--primary-on)] font-bold flex items-center justify-center">
              {pendingFriendRequests}
            </span>
          ) : null}
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
                {items.map((item) => {
                  const isHero = item.id === firstRenderedId;
                  const hideAuthor = item.diaryId === "d-me" && item.isMine;
                  if (isHero) {
                    return (
                      <HeroWithGhostStack key={item.id}>
                        <FeedCard item={item} variant="hero" hideAuthor={hideAuthor} />
                      </HeroWithGhostStack>
                    );
                  }
                  return (
                    <FeedCard key={item.id} item={item} variant="compact" hideAuthor={hideAuthor} />
                  );
                })}
              </div>
              {section.key === showHintAfterSection && filter === "all" ? <HintCard /> : null}
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
      className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-sm font-medium whitespace-nowrap transition-all shrink-0 ${
        active
          ? "text-[var(--primary-on)]"
          : "text-[var(--foreground)] hover:bg-[var(--accent-soft)]"
      }`}
      style={
        active
          ? {
              background: "var(--gradient-primary)",
              boxShadow: "0 4px 12px rgba(122, 27, 46, 0.25)",
            }
          : {
              background: "rgba(255, 255, 255, 0.5)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              border: "1px solid rgba(216, 201, 178, 0.5)",
            }
      }
    >
      {icon}
      {children}
    </button>
  );
}

function HeroWithGhostStack({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative pt-3 mt-1">
      {/* ghost card 2 (farthest) */}
      <div
        aria-hidden
        className="absolute rounded-[20px] pointer-events-none"
        style={{
          top: 0,
          left: 14,
          right: 14,
          bottom: 12,
          background: "rgba(255, 255, 255, 0.35)",
          border: "1px solid rgba(255, 255, 255, 0.55)",
          transform: "rotate(-1.8deg)",
          transformOrigin: "bottom center",
          zIndex: -2,
          boxShadow: "0 6px 14px rgba(122, 27, 46, 0.08)",
        }}
      />
      {/* ghost card 1 (nearer) */}
      <div
        aria-hidden
        className="absolute rounded-[20px] pointer-events-none"
        style={{
          top: 6,
          left: 6,
          right: 6,
          bottom: 6,
          background: "rgba(255, 255, 255, 0.55)",
          border: "1px solid rgba(255, 255, 255, 0.7)",
          transform: "rotate(1.1deg)",
          transformOrigin: "bottom center",
          zIndex: -1,
          boxShadow: "0 4px 12px rgba(122, 27, 46, 0.1)",
        }}
      />
      <div className="relative z-0">{children}</div>
    </div>
  );
}

function HintCard() {
  return (
    <div
      className="mt-3 p-3 rounded-[14px] border"
      style={{
        background: "var(--gradient-hint)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderColor: "rgba(250, 212, 192, 0.6)",
        boxShadow: "0 4px 16px rgba(232, 169, 138, 0.15)",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          style={{ background: "var(--gradient-accent-soft)" }}
        >
          <Sparkles size={15} className="text-[var(--accent)]" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--foreground)]">
            <span className="font-semibold">{hintCard.friend.nickname}</span>님{hintCard.message}
          </p>
          <button className="mt-1 text-sm text-[var(--accent)] font-medium">
            {hintCard.wineName}, 기록 보기 →
          </button>
        </div>
      </div>
    </div>
  );
}
