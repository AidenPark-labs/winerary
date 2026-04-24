import Image from "next/image";
import { UserPlus } from "lucide-react";
import type { MockPublicUser } from "../_mock/publicUsers";

export default function PublicUserCard({ user }: { user: MockPublicUser }) {
  return (
    <article
      className="shrink-0 w-[178px] rounded-[16px] overflow-hidden"
      style={{
        background: "var(--gradient-card)",
        backdropFilter: "blur(20px) saturate(1.3)",
        WebkitBackdropFilter: "blur(20px) saturate(1.3)",
        border: "1px solid var(--glass-border)",
        boxShadow: "inset 0 1px 0 var(--glass-highlight), 0 4px 16px -8px rgba(122,27,46,0.1)",
      }}
    >
      {/* wine photo with avatar overlay */}
      <div className="relative w-full aspect-[4/5] bg-[var(--surface-alt)]">
        <Image
          src={user.recentWine.photo}
          alt={user.recentWine.nameKo}
          fill
          className="object-cover"
          unoptimized
        />
        <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5 bg-white/88 backdrop-blur-md rounded-full pl-0.5 pr-2.5 py-0.5">
          <Image
            src={user.avatar}
            alt=""
            width={22}
            height={22}
            className="rounded-full object-cover shrink-0"
            unoptimized
          />
          <span className="text-[11px] font-bold text-[var(--foreground)] truncate">
            {user.nickname}
          </span>
        </div>
      </div>

      {/* body */}
      <div className="p-2.5">
        <p className="text-[11px] text-[var(--text-muted)] line-clamp-1">{user.bio}</p>

        <div className="mt-2">
          <div className="text-[13px] font-semibold text-[var(--foreground)] line-clamp-1 leading-tight">
            {user.recentWine.nameKo}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px]">
            <span className="text-[var(--text-muted)]">{user.recentWine.vintage}</span>
            <span className="text-[var(--accent)] font-semibold">⭐ {user.recentWine.rating}</span>
          </div>
        </div>

        <button
          type="button"
          className="mt-2.5 w-full inline-flex items-center justify-center gap-1 h-8 rounded-full text-[11px] font-semibold text-[var(--primary-on)]"
          style={{
            background: "var(--gradient-primary)",
            boxShadow: "0 2px 8px rgba(122,27,46,0.22)",
          }}
        >
          <UserPlus size={12} strokeWidth={2.4} />
          친구 요청
        </button>
      </div>
    </article>
  );
}
