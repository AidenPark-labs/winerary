import { Bell, UserPlus } from "lucide-react";
import FeedCard from "./_components/FeedCard";
import { feed, hintCard, pendingFriendRequests } from "./_mock/feed";

const sections: { key: "today" | "thisWeek" | "lastMonth"; label: string }[] = [
  { key: "today", label: "오늘" },
  { key: "thisWeek", label: "이번 주" },
  { key: "lastMonth", label: "지난달" },
];

export default function TogetherPage() {
  return (
    <div className="max-w-[640px] mx-auto px-3">
      {/* header */}
      <header className="flex items-center justify-between pt-5 pb-3">
        <h1 className="text-2xl font-bold tracking-tight">함께</h1>
        <button
          aria-label="알림"
          className="relative w-10 h-10 flex items-center justify-center rounded-full hover:bg-[var(--surface-alt)]"
        >
          <Bell size={20} strokeWidth={1.8} />
          <span className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-[var(--accent)]" />
        </button>
      </header>

      <p className="text-sm text-[var(--text-muted)] mb-4">친구들의 오늘</p>

      {/* friend request banner */}
      {pendingFriendRequests > 0 ? (
        <button className="w-full mb-4 px-3 py-3 bg-[var(--accent-soft)] rounded-[12px] flex items-center justify-between text-left hover:bg-[var(--accent-strong)]/50 transition-colors">
          <div className="flex items-center gap-2 text-[var(--accent)]">
            <UserPlus size={18} strokeWidth={2} />
            <span className="text-[15px] font-medium">새로운 인연이 기다리고 있어요</span>
          </div>
          <span className="text-sm text-[var(--accent)] font-semibold">{pendingFriendRequests}</span>
        </button>
      ) : null}

      {/* friends feed */}
      {sections.map((section) => {
        const items = feed.filter((f) => f.section === section.key);
        if (items.length === 0) return null;
        return (
          <section key={section.key} className="mb-6">
            <h2 className="text-sm font-semibold text-[var(--text-muted)] mb-2 px-1">{section.label}</h2>
            <div className="flex flex-col gap-3">
              {items.map((item) => (
                <FeedCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        );
      })}

      {/* hint card */}
      <div className="mb-6 p-3 rounded-[12px] bg-[var(--surface-raised)] border border-[var(--border)]">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--accent-soft)] flex items-center justify-center shrink-0">💡</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-[var(--foreground)]">
              <span className="font-semibold">{hintCard.friend.nickname}</span>님{hintCard.message}
            </p>
            <button className="mt-1 text-sm text-[var(--accent)] font-medium">{hintCard.wineName}, 기록 보기 →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
