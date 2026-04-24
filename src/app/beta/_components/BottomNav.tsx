"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, Users, Compass, User, Plus } from "lucide-react";
import { useState } from "react";
import QuickRecordSheet from "./QuickRecordSheet";

const tabs = [
  { href: "/beta", label: "노트", Icon: BookOpen, match: (p: string) => p === "/beta" || p.startsWith("/beta/notes") },
  { href: "/beta/together", label: "모임", Icon: Users, match: (p: string) => p.startsWith("/beta/together") },
  { href: "/beta/explore", label: "둘러보기", Icon: Compass, match: (p: string) => p.startsWith("/beta/explore") },
  { href: "/beta/me", label: "나", Icon: User, match: (p: string) => p.startsWith("/beta/me") },
];

export default function BottomNav() {
  const path = usePathname();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--surface)] border-t border-[var(--border)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* 5 slots: [노트] [함께] [+center] [둘러보기] [나] */}
        <div className="relative flex max-w-[640px] mx-auto">
          <TabButton {...tabs[0]} active={tabs[0].match(path)} onClick={() => router.push(tabs[0].href)} />
          <TabButton {...tabs[1]} active={tabs[1].match(path)} onClick={() => router.push(tabs[1].href)} />

          {/* center + */}
          <div className="flex-1 flex items-start justify-center relative" style={{ minWidth: 56 }}>
            <button
              aria-label="오늘의 한 잔 남기기"
              onClick={() => setSheetOpen(true)}
              className="absolute -top-6 w-14 h-14 rounded-full bg-[var(--accent)] text-[var(--primary-on)] flex items-center justify-center transition-transform active:scale-95 hover:bg-[var(--primary-hover)]"
              style={{ boxShadow: "0 4px 14px rgba(122, 27, 46, 0.25)" }}
            >
              <Plus size={26} strokeWidth={2.5} />
            </button>
          </div>

          <TabButton {...tabs[2]} active={tabs[2].match(path)} onClick={() => router.push(tabs[2].href)} />
          <TabButton {...tabs[3]} active={tabs[3].match(path)} onClick={() => router.push(tabs[3].href)} />
        </div>
      </nav>

      {sheetOpen ? <QuickRecordSheet onClose={() => setSheetOpen(false)} /> : null}
    </>
  );
}

function TabButton({
  href,
  label,
  Icon,
  active,
  onClick,
}: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  active: boolean;
  match?: (p: string) => boolean;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={`flex-1 flex flex-col items-center justify-center py-2 gap-1 text-[11px] transition-colors ${
        active ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
      }`}
      style={{ minHeight: 64 }}
    >
      <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
      <span className="font-medium">{label}</span>
    </Link>
  );
}
