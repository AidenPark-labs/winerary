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
      className="rounded-[20px] overflow-hidden"
      style={{
        background: "var(--gradient-card)",
        backdropFilter: "blur(24px) saturate(1.4)",
        WebkitBackdropFilter: "blur(24px) saturate(1.4)",
        border: "1px solid var(--glass-border)",
        boxShadow:
          "0 12px 32px -12px rgba(122, 27, 46, 0.18), inset 0 1px 0 var(--glass-highlight)",
      }}
    >
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

        {/* floating rating badge — light glass */}
        <div
          className="absolute top-3 right-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-full"
          style={{
            background: "rgba(255, 255, 255, 0.82)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: "1px solid rgba(255, 255, 255, 0.7)",
            boxShadow: "0 2px 10px rgba(17, 24, 39, 0.12)",
          }}
        >
          <span className="text-[var(--accent)] text-[11px]">★</span>
          <span className="text-xs font-bold text-[var(--foreground)]">{item.rating.toFixed(1)}</span>
        </div>

        {/* diary badge top-left (if shared) */}
        {item.diaryName ? (
          <div
            className="absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full"
            style={{
              background: "rgba(255, 255, 255, 0.82)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              border: "1px solid rgba(255, 255, 255, 0.7)",
              boxShadow: "0 2px 10px rgba(17, 24, 39, 0.12)",
            }}
          >
            <BookOpen size={11} strokeWidth={2.2} className="text-[var(--accent)]" />
            <span className="text-[11px] font-semibold text-[var(--accent)]">{item.diaryName}</span>
          </div>
        ) : null}
      </div>

      {/* text panel — cream glass */}
      <div className="px-4 pt-3 pb-4">
        {hideAuthor ? (
          <div className="text-xs text-[var(--text-muted)] mb-1.5">{item.timeLabel}</div>
        ) : (
          <div className="flex items-center gap-2 mb-2">
            <Image
              src={item.author.avatar}
              alt=""
              width={24}
              height={24}
              className="rounded-full object-cover"
              unoptimized
            />
            <span className="text-sm font-semibold text-[var(--foreground)]">{item.author.nickname}</span>
            <span className="text-xs text-[var(--text-muted)]">· {item.timeLabel}</span>
          </div>
        )}

        <h2
          className="text-[19px] tracking-wide leading-snug text-[var(--foreground)] font-medium"
          style={{ fontFamily: "var(--font-serif), 'Pretendard Variable', serif" }}
        >
          {item.wine.nameKo ?? item.wine.name}
          <span className="text-[var(--text-muted)] font-normal"> {item.wine.vintage}</span>
        </h2>

        {item.wine.nameKo ? (
          <p className="text-[11px] text-[var(--text-muted)] italic mt-0.5 truncate">
            {item.wine.name}
          </p>
        ) : null}

        <p className="text-xs text-[var(--text-muted)] mt-1">{item.wine.country}</p>

        {item.memo ? (
          <p className="mt-2.5 text-[14px] leading-relaxed text-[var(--foreground)] italic">
            &ldquo;{item.memo}&rdquo;
          </p>
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
