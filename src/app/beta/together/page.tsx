import { Bell, UserPlus, Sparkles } from "lucide-react";
import FeedCard from "../_components/FeedCard";
import PublicUserCard from "../_components/PublicUserCard";
import { feed, hintCard, pendingFriendRequests } from "../_mock/feed";
import { publicUsers } from "../_mock/publicUsers";

const sections: { key: "today" | "thisWeek" | "lastMonth"; label: string }[] = [
  { key: "today", label: "오늘" },
  { key: "thisWeek", label: "이번 주" },
  { key: "lastMonth", label: "지난달" },
];

export default function TogetherPage() {
  return (
    <div className="max-w-[640px] mx-auto px-3">
      <header className="flex items-center justify-between pt-5 pb-3">
        <h1 className="text-2xl font-bold tracking-tight">함께</h1>
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

      <p className="text-sm text-[var(--text-muted)] mb-4">친구들의 오늘</p>

      {/* public users discovery — shown always, but especially useful for new users with 0 friends */}
      <section className="mb-6">
        <div className="flex items-baseline justify-between mb-3 px-1">
          <h2 className="text-lg font-semibold">이런 한 잔을 남기는 사람들</h2>
          <button className="text-sm text-[var(--text-muted)]">더보기</button>
        </div>
        <div className="flex gap-3 overflow-x-auto -mx-3 px-3 pb-1">
          {publicUsers.map((u) => (
            <PublicUserCard key={u.id} user={u} />
          ))}
        </div>
      </section>

      {/* friend request banner */}
      {pendingFriendRequests > 0 ? (
        <button
          className="w-full mb-4 px-3 py-3 rounded-[14px] flex items-center justify-between text-left transition-all hover:brightness-105"
          style={{
            background: "var(--gradient-hint)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: "1px solid rgba(250, 212, 192, 0.6)",
            boxShadow: "0 4px 16px rgba(232, 169, 138, 0.15)",
          }}
        >
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
      <div
        className="mb-6 p-3 rounded-[14px] border"
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
    </div>
  );
}
