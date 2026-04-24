import Image from "next/image";
import { Search, Camera, ChevronRight } from "lucide-react";
import { todaysPicks, someday, dictionaryTopics, friendsFavorites } from "../_mock/explore";

export default function ExplorePage() {
  return (
    <div className="max-w-[640px] mx-auto px-3">
      <header className="pt-5 pb-3">
        <h1 className="text-2xl font-bold tracking-tight">둘러보기</h1>
      </header>

      {/* search bar — glass */}
      <div
        className="flex items-center gap-2 h-12 px-3 rounded-[14px] mb-6"
        style={{
          background: "var(--glass-bg-strong)",
          backdropFilter: "blur(20px) saturate(1.3)",
          WebkitBackdropFilter: "blur(20px) saturate(1.3)",
          border: "1px solid var(--glass-border)",
          boxShadow: "inset 0 1px 0 var(--glass-highlight)",
        }}
      >
        <Search size={18} className="text-[var(--text-muted)]" />
        <input
          placeholder="이 와인, 찾고 있어요?"
          className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--text-muted)]"
        />
        <button aria-label="사진으로 찾기" className="text-[var(--accent)] w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--accent-soft)]">
          <Camera size={18} strokeWidth={1.8} />
        </button>
      </div>

      {/* today's picks */}
      <section className="mb-7">
        <div className="flex items-baseline justify-between mb-3 px-1">
          <h2 className="text-lg font-semibold">오늘은 이런 와인 어때요</h2>
          <button className="text-sm text-[var(--text-muted)]">더보기</button>
        </div>
        <div className="flex gap-3 overflow-x-auto -mx-3 px-3 pb-1">
          {todaysPicks.map((w) => (
            <article
              key={w.id}
              className="shrink-0 w-[160px] rounded-[14px] overflow-hidden"
              style={{
                background: "var(--gradient-card)",
                backdropFilter: "blur(20px) saturate(1.3)",
                WebkitBackdropFilter: "blur(20px) saturate(1.3)",
                border: "1px solid var(--glass-border)",
                boxShadow: "inset 0 1px 0 var(--glass-highlight)",
              }}
            >
              <div className="relative w-full aspect-[3/4] bg-[var(--surface-alt)]">
                <Image src={w.photo} alt={w.nameKo ?? w.name} fill className="object-cover" unoptimized />
              </div>
              <div className="p-2.5">
                <div className="text-[13px] font-semibold text-[var(--foreground)] line-clamp-2 leading-tight">
                  {w.nameKo ?? w.name}
                </div>
                <div className="mt-1 text-xs text-[var(--text-muted)]">{w.country}</div>
                {w.rating ? (
                  <div className="mt-1.5 text-xs text-[var(--accent)] font-semibold">⭐ {w.rating}</div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* friends' favorites */}
      <section className="mb-7">
        <div className="flex items-baseline justify-between mb-3 px-1">
          <h2 className="text-lg font-semibold">친구가 좋아한 한 잔</h2>
          <span className="text-sm text-[var(--text-muted)]">최근</span>
        </div>
        <div className="flex gap-3 overflow-x-auto -mx-3 px-3 pb-1">
          {friendsFavorites.map((w) => (
            <article
              key={w.id}
              className="shrink-0 w-[170px] rounded-[14px] overflow-hidden"
              style={{
                background: "var(--gradient-card)",
                backdropFilter: "blur(20px) saturate(1.3)",
                WebkitBackdropFilter: "blur(20px) saturate(1.3)",
                border: "1px solid var(--glass-border)",
                boxShadow: "inset 0 1px 0 var(--glass-highlight)",
              }}
            >
              <div className="relative w-full aspect-[3/4] bg-[var(--surface-alt)]">
                <Image src={w.photo} alt={w.nameKo ?? w.name} fill className="object-cover" unoptimized />
                <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-full pl-0.5 pr-2 py-0.5">
                  <Image
                    src={w.friendAvatar}
                    alt={w.friendName}
                    width={20}
                    height={20}
                    className="rounded-full object-cover"
                    unoptimized
                  />
                  <span className="text-[11px] font-semibold text-[var(--accent)]">{w.friendName}</span>
                </div>
              </div>
              <div className="p-2.5">
                <div className="text-[13px] font-semibold text-[var(--foreground)] line-clamp-2 leading-tight">
                  {w.nameKo ?? w.name}
                </div>
                <div className="mt-1 text-xs text-[var(--text-muted)]">{w.country}</div>
                {w.rating ? (
                  <div className="mt-1.5 text-xs text-[var(--accent)] font-semibold">⭐ {w.rating}</div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* someday */}
      <section className="mb-7">
        <div className="flex items-baseline justify-between mb-3 px-1">
          <h2 className="text-lg font-semibold">언젠가 마셔볼 와인</h2>
          <span className="text-sm text-[var(--text-muted)]">{someday.length}</span>
        </div>
        <div className="flex gap-3 overflow-x-auto -mx-3 px-3 pb-1">
          {someday.map((w) => (
            <article
              key={w.id}
              className="shrink-0 w-[140px]"
            >
              <div className="relative w-full aspect-[3/4] rounded-[12px] overflow-hidden bg-[var(--surface-alt)]">
                <Image src={w.photo} alt={w.nameKo ?? w.name} fill className="object-cover" unoptimized />
              </div>
              <div className="mt-2 text-[13px] font-medium text-[var(--foreground)] line-clamp-2 leading-tight">
                {w.nameKo ?? w.name}
              </div>
              <div className="text-xs text-[var(--text-muted)]">{w.country}</div>
            </article>
          ))}
        </div>
      </section>

      {/* dictionary */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-3 px-1">와인 이야기</h2>
        <div className="flex flex-col gap-2">
          {dictionaryTopics.map((t) => (
            <button
              key={t.id}
              className="w-full flex items-center justify-between p-3 rounded-[14px] text-left transition-all hover:brightness-105"
              style={{
                background: "var(--gradient-card)",
                backdropFilter: "blur(20px) saturate(1.3)",
                WebkitBackdropFilter: "blur(20px) saturate(1.3)",
                border: "1px solid var(--glass-border)",
                boxShadow: "inset 0 1px 0 var(--glass-highlight)",
              }}
            >
              <div>
                <div className="text-[15px] font-semibold">{t.label}</div>
                <div className="mt-0.5 text-xs text-[var(--text-muted)]">{t.hint}</div>
              </div>
              <ChevronRight size={18} className="text-[var(--text-muted)]" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
