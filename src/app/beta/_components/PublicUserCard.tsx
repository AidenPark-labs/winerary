import Image from "next/image";
import { UserPlus } from "lucide-react";
import type { MockPublicUser } from "../_mock/publicUsers";

export default function PublicUserCard({ user }: { user: MockPublicUser }) {
  return (
    <article className="shrink-0 w-[168px] rounded-[12px] overflow-hidden bg-[var(--surface-raised)] border border-[var(--border)]">
      <div className="relative w-full aspect-[4/5] bg-[var(--surface-alt)]">
        <Image
          src={user.recentWine.photo}
          alt={user.recentWine.nameKo}
          fill
          className="object-cover"
          unoptimized
        />
      </div>

      <div className="p-3">
        <div className="flex items-center gap-2">
          <Image
            src={user.avatar}
            alt=""
            width={22}
            height={22}
            className="rounded-full object-cover shrink-0"
            unoptimized
          />
          <span className="text-[13px] font-semibold text-[var(--foreground)] truncate">
            {user.nickname}
          </span>
        </div>

        <p className="mt-1.5 text-[11px] text-[var(--text-muted)] line-clamp-1">{user.bio}</p>

        <div className="mt-2.5 pt-2.5 border-t border-[var(--border)]">
          <div
            className="text-[12px] text-[var(--foreground)] line-clamp-1 leading-tight"
            style={{ fontFamily: "var(--font-serif-ko)", fontWeight: 500 }}
          >
            {user.recentWine.nameKo}
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            {user.recentWine.vintage} · <span className="text-[var(--accent)] font-semibold">⭐ {user.recentWine.rating}</span>
          </div>
        </div>

        <button
          type="button"
          className="mt-3 w-full inline-flex items-center justify-center gap-1 h-8 rounded-[8px] text-[12px] font-semibold text-[var(--accent)] border border-[var(--border-strong)] hover:bg-[var(--surface-alt)] transition-colors"
        >
          <UserPlus size={12} strokeWidth={2.2} />
          친구 요청
        </button>
      </div>
    </article>
  );
}
