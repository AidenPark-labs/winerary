import Image from "next/image";
import { BookOpen } from "lucide-react";
import type { MockFeedItem } from "../_mock/feed";

type Variant = "compact" | "hero";

export default function FeedCard({
  item,
  hideAuthor = false,
  variant = "compact",
}: {
  item: MockFeedItem;
  hideAuthor?: boolean;
  variant?: Variant;
}) {
  return variant === "hero" ? (
    <HeroCard item={item} hideAuthor={hideAuthor} />
  ) : (
    <CompactCard item={item} hideAuthor={hideAuthor} />
  );
}

function HeroCard({ item, hideAuthor }: { item: MockFeedItem; hideAuthor: boolean }) {
  return (
    <article
      className="group relative rounded-[24px] overflow-hidden shadow-xl flex flex-col border border-white/25"
      style={{ minHeight: 420 }}
    >
      {/* background photo */}
      <div className="absolute inset-0 z-0">
        <Image
          src={item.wine.photo}
          alt={item.wine.nameKo ?? item.wine.name}
          fill
          className="object-cover transition-transform duration-700 group-hover:scale-105"
          style={{ objectPosition: "center 5%" }}
          unoptimized
          priority
        />
      </div>

      {/* gradient overlay for legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent z-10 pointer-events-none" />

      {/* top row — author/time + rating */}
      <div className="relative z-20 flex justify-between items-start p-4">
        {hideAuthor ? (
          <span className="px-3 py-1.5 rounded-full bg-black/45 backdrop-blur-md border border-white/15 text-white text-xs font-medium shadow-lg">
            {item.timeLabel}
          </span>
        ) : (
          <div className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-black/45 backdrop-blur-md border border-white/15 shadow-lg">
            <Image
              src={item.author.avatar}
              alt=""
              width={22}
              height={22}
              className="rounded-full object-cover"
              unoptimized
            />
            <span className="text-white text-xs font-semibold">{item.author.nickname}</span>
            <span className="text-white/70 text-xs">· {item.timeLabel}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/45 backdrop-blur-md border border-white/15 shadow-lg">
          <span className="text-amber-400 text-[11px]">★</span>
          <span className="text-xs font-bold text-amber-400">{item.rating.toFixed(1)}</span>
        </div>
      </div>

      {/* spacer */}
      <div className="flex-1 min-h-[180px] z-10 pointer-events-none" />

      {/* bottom glass panel */}
      <div className="relative z-20 mt-auto px-5 py-4 bg-black/40 backdrop-blur-2xl border-t border-white/10">
        <h2
          className="text-white text-lg tracking-wide leading-tight line-clamp-1 drop-shadow-md font-medium"
          style={{ fontFamily: "var(--font-serif), 'Pretendard Variable', serif" }}
        >
          {item.wine.nameKo ?? item.wine.name}
          <span className="text-white/60 font-normal"> {item.wine.vintage}</span>
        </h2>
        {item.wine.nameKo ? (
          <p className="text-[11px] text-white/70 italic font-light truncate drop-shadow-sm">
            {item.wine.name}
          </p>
        ) : null}
        <p className="text-[11px] text-white/70 font-light tracking-wide mt-1">{item.wine.country}</p>

        {item.memo ? (
          <p className="mt-2 text-sm text-white/90 italic line-clamp-2 drop-shadow-sm leading-relaxed">
            &ldquo;{item.memo}&rdquo;
          </p>
        ) : null}

        {item.diaryName ? (
          <div className="mt-2.5 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-white/12 border border-white/20 text-white/95">
            <BookOpen size={11} strokeWidth={2} />
            <span>{item.diaryName}</span>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function CompactCard({ item, hideAuthor }: { item: MockFeedItem; hideAuthor: boolean }) {
  return (
    <article
      className="rounded-[16px] p-3 flex gap-3"
      style={{
        background: "var(--gradient-card)",
        backdropFilter: "blur(24px) saturate(1.4)",
        WebkitBackdropFilter: "blur(24px) saturate(1.4)",
        border: "1px solid var(--glass-border)",
        boxShadow:
          "0 4px 24px -8px rgba(122, 27, 46, 0.12), inset 0 1px 0 var(--glass-highlight)",
      }}
    >
      <div className="shrink-0 w-[104px] aspect-[4/5] rounded-[10px] overflow-hidden bg-[var(--surface-alt)] relative">
        <Image
          src={item.wine.photo}
          alt={item.wine.nameKo ?? item.wine.name}
          fill
          className="object-cover"
          unoptimized
        />
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        {hideAuthor ? (
          <div className="text-xs text-[var(--text-muted)] mb-1">{item.timeLabel}</div>
        ) : (
          <div className="flex items-center gap-1.5 mb-1">
            <Image
              src={item.author.avatar}
              alt=""
              width={18}
              height={18}
              className="rounded-full object-cover"
              unoptimized
            />
            <span className="text-xs font-semibold text-[var(--foreground)]">{item.author.nickname}</span>
            <span className="text-xs text-[var(--text-muted)]">· {item.timeLabel}</span>
          </div>
        )}

        <h3 className="text-[15px] font-semibold leading-snug text-[var(--foreground)] line-clamp-2">
          {item.wine.nameKo ?? item.wine.name}{" "}
          <span className="text-[var(--text-muted)] font-normal">{item.wine.vintage}</span>
        </h3>

        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)] truncate">{item.wine.country}</span>
          <span className="text-xs text-[var(--accent)] font-semibold shrink-0">⭐ {item.rating.toFixed(1)}</span>
        </div>

        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--foreground)] line-clamp-2">{item.memo}</p>

        {item.diaryName ? (
          <div className="mt-auto pt-1.5 inline-flex items-center gap-1 text-xs text-[var(--accent)]">
            <BookOpen size={12} strokeWidth={2} />
            <span className="truncate">{item.diaryName}</span>
          </div>
        ) : null}
      </div>
    </article>
  );
}
