import Image from "next/image";
import { BookOpen } from "lucide-react";
import type { MockFeedItem } from "../_mock/feed";
import StarRating from "./StarRating";

export default function FeedCard({
  item,
  hideAuthor = false,
}: {
  item: MockFeedItem;
  hideAuthor?: boolean;
}) {
  return (
    <article
      className="rounded-[14px] border border-[var(--border)] p-3 flex gap-3"
      style={{
        background: "var(--gradient-card)",
        boxShadow:
          "0 1px 2px rgba(17,24,39,0.04), 0 8px 24px -16px rgba(122, 27, 46, 0.08)",
      }}
    >
      {/* photo — left thumbnail */}
      <div className="shrink-0 w-[104px] aspect-[4/5] rounded-[10px] overflow-hidden bg-[var(--surface-alt)] relative">
        <Image
          src={item.wine.photo}
          alt={item.wine.nameKo ?? item.wine.name}
          fill
          className="object-cover"
          unoptimized
        />
      </div>

      {/* text — right */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* meta row */}
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

        {/* wine name */}
        <h3 className="text-[15px] font-semibold leading-snug text-[var(--foreground)] line-clamp-2">
          {item.wine.nameKo ?? item.wine.name}{" "}
          <span className="text-[var(--text-muted)] font-normal">{item.wine.vintage}</span>
        </h3>

        {/* country + rating row */}
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)] truncate">{item.wine.country}</span>
          <span className="text-xs text-[var(--accent)] font-semibold shrink-0">⭐ {item.rating.toFixed(1)}</span>
        </div>

        {/* memo */}
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--foreground)] line-clamp-2">{item.memo}</p>

        {/* diary badge */}
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
