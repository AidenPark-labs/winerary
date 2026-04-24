import Image from "next/image";
import { BookOpen } from "lucide-react";
import type { MockFeedItem } from "../_mock/feed";
import StarRating from "./StarRating";

export default function FeedCard({ item }: { item: MockFeedItem }) {
  return (
    <article className="bg-[var(--surface-raised)] rounded-[12px] shadow-[0_1px_2px_rgba(17,24,39,0.04)] border border-[var(--border)] overflow-hidden">
      <header className="flex items-center gap-3 px-3 pt-3">
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

      <div className="mt-3 relative aspect-[4/5] bg-[var(--surface-alt)]">
        <Image src={item.wine.photo} alt={item.wine.nameKo ?? item.wine.name} fill className="object-cover" unoptimized />
      </div>

      <div className="px-3 pt-3 pb-4">
        <h3 className="text-[17px] font-semibold leading-snug text-[var(--foreground)]">
          {item.wine.nameKo ?? item.wine.name} <span className="text-[var(--text-muted)] font-normal">{item.wine.vintage}</span>
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
