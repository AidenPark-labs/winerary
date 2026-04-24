import Image from "next/image";
import { BookOpen } from "lucide-react";
import type { MockFeedItem } from "../_mock/feed";
import StarRating from "./StarRating";

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
      className="rounded-[18px] overflow-hidden"
      style={{
        background: "var(--gradient-card)",
        backdropFilter: "blur(28px) saturate(1.5)",
        WebkitBackdropFilter: "blur(28px) saturate(1.5)",
        border: "1px solid var(--glass-border)",
        boxShadow:
          "0 12px 32px -12px rgba(122, 27, 46, 0.18), inset 0 1px 0 var(--glass-highlight)",
      }}
    >
      {hideAuthor ? (
        <header className="px-4 pt-3 pb-1 text-xs text-[var(--text-muted)]">{item.timeLabel}</header>
      ) : (
        <header className="flex items-center gap-3 px-4 pt-3 pb-1">
          <Image
            src={item.author.avatar}
            alt={item.author.nickname}
            width={36}
            height={36}
            className="rounded-full object-cover"
            unoptimized
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-[var(--foreground)]">{item.author.nickname}</div>
            <div className="text-xs text-[var(--text-muted)]">{item.timeLabel}</div>
          </div>
        </header>
      )}

      <div className="mt-2 relative aspect-[4/5] bg-[var(--surface-alt)]">
        <Image
          src={item.wine.photo}
          alt={item.wine.nameKo ?? item.wine.name}
          fill
          className="object-cover"
          unoptimized
        />
      </div>

      <div className="px-4 pt-3 pb-4">
        <h3 className="text-[17px] font-semibold leading-snug text-[var(--foreground)]">
          {item.wine.nameKo ?? item.wine.name}{" "}
          <span className="text-[var(--text-muted)] font-normal">{item.wine.vintage}</span>
        </h3>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{item.wine.country}</p>

        <div className="mt-3 flex items-center gap-2">
          <StarRating value={item.rating} readOnly size={18} />
          <span className="text-sm font-semibold text-[var(--foreground)]">{item.rating.toFixed(1)}</span>
        </div>

        <p className="mt-2 text-[15px] leading-relaxed text-[var(--foreground)]">{item.memo}</p>

        {item.diaryName ? (
          <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-[var(--accent)]">
            <BookOpen size={14} strokeWidth={2} />
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
