import Image from "next/image";
import { Search, Camera, ChevronRight } from "lucide-react";
import { todaysPicks, someday, dictionaryTopics } from "../_mock/explore";

export default function ExplorePage() {
  return (
    <div className="max-w-[640px] mx-auto px-3">
      <header className="pt-6 pb-4">
        <h1
          className="text-[26px] text-[var(--foreground)]"
          style={{
            fontFamily: "var(--font-serif-ko)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          둘러보기
        </h1>
      </header>

      {/* search bar */}
      <div className="flex items-center gap-2 h-12 px-3 rounded-[12px] mb-7 bg-[var(--surface-raised)] border border-[var(--border)]">
        <Search size={18} className="text-[var(--text-muted)]" />
        <input
          placeholder="이 와인, 찾고 있어요?"
          className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--text-muted)]"
        />
        <button
          aria-label="사진으로 찾기"
          className="text-[var(--accent)] w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--accent-soft)]"
        >
          <Camera size={18} strokeWidth={1.8} />
        </button>
      </div>

      {/* today's picks */}
      <Section title="오늘은 이런 와인 어때요" action="더보기">
        <div className="flex gap-3 overflow-x-auto -mx-3 px-3 pb-1">
          {todaysPicks.map((w) => (
            <article
              key={w.id}
              className="shrink-0 w-[156px] rounded-[12px] overflow-hidden bg-[var(--surface-raised)] border border-[var(--border)]"
            >
              <div className="relative w-full aspect-[3/4] bg-[var(--surface-alt)]">
                <Image src={w.photo} alt={w.nameKo ?? w.name} fill className="object-cover" unoptimized />
              </div>
              <div className="p-2.5">
                <div
                  className="text-[13px] text-[var(--foreground)] line-clamp-2 leading-tight"
                  style={{ fontFamily: "var(--font-serif-ko)", fontWeight: 500 }}
                >
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
      </Section>

      {/* someday */}
      <Section title="언젠가 마셔볼 와인" right={<span className="text-sm text-[var(--text-muted)]">{someday.length}</span>}>
        <div className="flex gap-3 overflow-x-auto -mx-3 px-3 pb-1">
          {someday.map((w) => (
            <article key={w.id} className="shrink-0 w-[132px]">
              <div className="relative w-full aspect-[3/4] rounded-[10px] overflow-hidden bg-[var(--surface-alt)] border border-[var(--border)]">
                <Image src={w.photo} alt={w.nameKo ?? w.name} fill className="object-cover" unoptimized />
              </div>
              <div
                className="mt-2 text-[13px] text-[var(--foreground)] line-clamp-2 leading-tight"
                style={{ fontFamily: "var(--font-serif-ko)", fontWeight: 500 }}
              >
                {w.nameKo ?? w.name}
              </div>
              <div className="text-xs text-[var(--text-muted)]">{w.country}</div>
            </article>
          ))}
        </div>
      </Section>

      {/* dictionary */}
      <Section title="와인 이야기">
        <div className="flex flex-col gap-2">
          {dictionaryTopics.map((t) => (
            <button
              key={t.id}
              className="w-full flex items-center justify-between p-3 rounded-[12px] text-left bg-[var(--surface-raised)] border border-[var(--border)] hover:bg-[var(--surface-alt)] transition-colors"
            >
              <div>
                <div
                  className="text-[15px] text-[var(--foreground)]"
                  style={{ fontFamily: "var(--font-serif-ko)", fontWeight: 600 }}
                >
                  {t.label}
                </div>
                <div className="mt-0.5 text-xs text-[var(--text-muted)]">{t.hint}</div>
              </div>
              <ChevronRight size={18} className="text-[var(--text-muted)]" />
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  action,
  right,
  children,
}: {
  title: string;
  action?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between mb-3 px-1">
        <h2
          className="text-[17px] text-[var(--foreground)]"
          style={{
            fontFamily: "var(--font-serif-ko)",
            fontWeight: 600,
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h2>
        {action ? <button className="text-sm text-[var(--text-muted)]">{action}</button> : right}
      </div>
      {children}
    </section>
  );
}
