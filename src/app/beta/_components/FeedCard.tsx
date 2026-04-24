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
    <article className="rounded-[16px] overflow-hidden bg-[var(--surface-raised)] border border-[var(--border)]">
      {/* photo area — 4:3 */}
      <div className="relative aspect-[4/3] bg-[var(--surface-alt)] overflow-hidden">
        <Image
          src={item.wine.photo}
          alt={item.wine.nameKo ?? item.wine.name}
          fill
          className="object-cover"
          unoptimized
          priority
        />
      </div>

      {/* text panel */}
      <div className="px-5 pt-4 pb-5">
        <div className="flex items-center justify-between mb-3">
          {hideAuthor ? (
            <span className="text-xs text-[var(--text-muted)]">{item.timeLabel}</span>
          ) : (
            <div className="flex items-center gap-2">
              <Image
                src={item.author.avatar}
                alt=""
                width={22}
                height={22}
                className="rounded-full object-cover"
                unoptimized
              />
              <span className="text-xs font-semibold text-[var(--foreground)]">
                {item.author.nickname}
              </span>
              <span className="text-xs text-[var(--text-muted)]">· {item.timeLabel}</span>
            </div>
          )}
          <span className="text-xs font-semibold text-[var(--accent)]">⭐ {item.rating.toFixed(1)}</span>
        </div>

        <h2
          className="text-[20px] leading-snug text-[var(--foreground)]"
          style={{
            fontFamily: "var(--font-serif-ko)",
            fontWeight: 600,
            letterSpacing: "-0.01em",
          }}
        >
          {item.wine.nameKo ?? item.wine.name}
          <span className="text-[var(--text-muted)] font-normal"> {item.wine.vintage}</span>
        </h2>

        {item.wine.nameKo ? (
          <p className="text-[11px] text-[var(--text-muted)] mt-1 truncate tracking-wide">
            {item.wine.name}
          </p>
        ) : null}

        <p className="text-xs text-[var(--text-muted)] mt-1.5">{item.wine.country}</p>

        {item.memo ? (
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--foreground)]">{item.memo}</p>
        ) : null}

        {item.diaryName ? (
          <div className="mt-3 inline-flex items-center gap-1 text-[11px] text-[var(--accent)] font-medium">
            <BookOpen size={12} strokeWidth={2} />
            <span>{item.diaryName}</span>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function CompactCard({ item, hideAuthor }: { item: MockFeedItem; hideAuthor: boolean }) {
  return (
    <article className="rounded-[12px] p-3 flex gap-3 bg-[var(--surface-raised)] border border-[var(--border)]">
      <div className="shrink-0 w-[92px] aspect-[4/5] rounded-[8px] overflow-hidden bg-[var(--surface-alt)] relative">
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

        <h3
          className="text-[15px] leading-snug text-[var(--foreground)] line-clamp-2"
          style={{ fontFamily: "var(--font-serif-ko)", fontWeight: 500, letterSpacing: "-0.01em" }}
        >
          {item.wine.nameKo ?? item.wine.name}{" "}
          <span className="text-[var(--text-muted)] font-normal">{item.wine.vintage}</span>
        </h3>

        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)] truncate">{item.wine.country}</span>
          <span className="text-xs text-[var(--accent)] font-semibold shrink-0">⭐ {item.rating.toFixed(1)}</span>
        </div>

        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--foreground)] line-clamp-2">{item.memo}</p>

        {item.diaryName ? (
          <div className="mt-auto pt-1.5 inline-flex items-center gap-1 text-[11px] text-[var(--accent)]">
            <BookOpen size={11} strokeWidth={2} />
            <span className="truncate">{item.diaryName}</span>
          </div>
        ) : null}
      </div>
    </article>
  );
}
