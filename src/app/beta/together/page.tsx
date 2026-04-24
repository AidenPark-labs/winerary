import Image from "next/image";
import { Plus, UserPlus, Bell, ChevronRight } from "lucide-react";
import { diaries } from "../_mock/diaries";
import { friends, pendingFriendRequests } from "../_mock/feed";

export default function TogetherPage() {
  const sharedDiaries = diaries.filter((d) => !d.isPersonal);

  return (
    <div className="max-w-[640px] mx-auto px-3">
      <header className="flex items-center justify-between pt-6 pb-2">
        <h1
          className="text-[26px] text-[var(--foreground)]"
          style={{
            fontFamily: "var(--font-serif-ko)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          모임
        </h1>
        <button
          aria-label="친구 요청"
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

      <p className="text-sm text-[var(--text-muted)] mb-6">함께 기록하는 사람들과의 자리</p>

      {/* friend request row (compact) */}
      {pendingFriendRequests > 0 ? (
        <button className="w-full mb-6 px-3 py-3 rounded-[12px] flex items-center justify-between text-left bg-[var(--surface-alt)] border border-[var(--border)] hover:bg-[var(--surface-raised)] transition-colors">
          <div className="flex items-center gap-2 text-[var(--accent)]">
            <UserPlus size={18} strokeWidth={2} />
            <span className="text-[14px] font-medium">
              새로운 인연 {pendingFriendRequests}건
            </span>
          </div>
          <ChevronRight size={16} className="text-[var(--accent)]" />
        </button>
      ) : null}

      {/* shared notes (모임 entries) */}
      <section className="mb-8">
        <div className="flex items-baseline justify-between mb-3 px-1">
          <h2
            className="text-[17px] text-[var(--foreground)]"
            style={{ fontFamily: "var(--font-serif-ko)", fontWeight: 600 }}
          >
            우리 모임
          </h2>
          <span className="text-sm text-[var(--text-muted)]">{sharedDiaries.length}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {sharedDiaries.map((d) => (
            <DiaryCard
              key={d.id}
              name={d.name}
              cover={d.cover}
              memberCount={d.memberCount ?? 0}
              lastActivity={d.lastActivity}
              recordCount={d.recordCount}
            />
          ))}
          <NewDiaryCard />
        </div>
      </section>

      {/* friends */}
      <section className="mb-8">
        <div className="flex items-baseline justify-between mb-3 px-1">
          <h2
            className="text-[17px] text-[var(--foreground)]"
            style={{ fontFamily: "var(--font-serif-ko)", fontWeight: 600 }}
          >
            친구
          </h2>
          <span className="text-sm text-[var(--text-muted)]">{friends.length}</span>
        </div>

        <div className="flex gap-3 overflow-x-auto -mx-3 px-3 pb-1">
          {friends.map((f) => (
            <FriendChip key={f.id} nickname={f.nickname} avatar={f.avatar} />
          ))}
          <InviteChip />
        </div>
      </section>
    </div>
  );
}

function DiaryCard({
  name,
  cover,
  memberCount,
  lastActivity,
  recordCount,
}: {
  name: string;
  cover: string;
  memberCount: number;
  lastActivity: string;
  recordCount: number;
}) {
  return (
    <button
      type="button"
      className="text-left rounded-[12px] overflow-hidden bg-[var(--surface-raised)] border border-[var(--border)] hover:bg-[var(--surface-alt)] transition-colors"
    >
      <div className="relative w-full aspect-square bg-[var(--surface-alt)]">
        <Image src={cover} alt="" fill className="object-cover" unoptimized />
      </div>
      <div className="p-3">
        <div
          className="text-[15px] text-[var(--foreground)] line-clamp-1 leading-tight"
          style={{ fontFamily: "var(--font-serif-ko)", fontWeight: 600 }}
        >
          {name}
        </div>
        <div className="mt-1 text-xs text-[var(--text-muted)]">
          {memberCount}명 · 기록 {recordCount}
        </div>
        <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{lastActivity}</div>
      </div>
    </button>
  );
}

function NewDiaryCard() {
  return (
    <button
      type="button"
      className="flex flex-col items-center justify-center gap-2 rounded-[12px] border-2 border-dashed border-[var(--border-strong)] text-[var(--accent)] hover:bg-[var(--surface-alt)] transition-colors aspect-square"
    >
      <div className="w-11 h-11 rounded-full bg-[var(--accent-soft)] flex items-center justify-center">
        <Plus size={22} strokeWidth={2.2} />
      </div>
      <span
        className="text-[13px]"
        style={{ fontFamily: "var(--font-serif-ko)", fontWeight: 600 }}
      >
        새 모임
      </span>
      <span className="text-[11px] text-[var(--text-muted)]">함께 쓸 노트 만들기</span>
    </button>
  );
}

function FriendChip({ nickname, avatar }: { nickname: string; avatar: string }) {
  return (
    <button
      type="button"
      className="shrink-0 flex flex-col items-center gap-1.5 w-[64px] text-center hover:opacity-90"
    >
      <div className="relative w-14 h-14 rounded-full overflow-hidden border border-[var(--border)]">
        <Image src={avatar} alt="" fill className="object-cover" unoptimized />
      </div>
      <span className="text-[12px] text-[var(--foreground)] truncate w-full">{nickname}</span>
    </button>
  );
}

function InviteChip() {
  return (
    <button
      type="button"
      className="shrink-0 flex flex-col items-center gap-1.5 w-[64px] text-center hover:opacity-90"
    >
      <div className="w-14 h-14 rounded-full flex items-center justify-center bg-[var(--surface-alt)] border border-dashed border-[var(--border-strong)] text-[var(--accent)]">
        <Plus size={22} strokeWidth={2.2} />
      </div>
      <span className="text-[12px] text-[var(--accent)] font-medium truncate w-full">초대</span>
    </button>
  );
}
