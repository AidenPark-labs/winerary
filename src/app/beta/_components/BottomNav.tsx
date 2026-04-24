"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, Compass, User, Plus } from "lucide-react";
import { useState } from "react";
import QuickRecordSheet from "./QuickRecordSheet";

const tabs = [
  { href: "/beta", label: "노트", Icon: BookOpen, match: (p: string) => p === "/beta" || p.startsWith("/beta/notes") },
  { href: "/beta/explore", label: "둘러보기", Icon: Compass, match: (p: string) => p.startsWith("/beta/explore") },
  { href: "/beta/me", label: "나", Icon: User, match: (p: string) => p.startsWith("/beta/me") },
];

export default function BottomNav() {
  const path = usePathname();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      {/* Floating action button — bottom-right above nav */}
      <button
        aria-label="오늘의 한 잔 남기기"
        onClick={() => setSheetOpen(true)}
        className="fixed right-4 z-50 w-14 h-14 rounded-full bg-[var(--accent)] text-[var(--primary-on)] flex items-center justify-center transition-transform active:scale-95 hover:bg-[var(--primary-hover)]"
        style={{
          bottom: "calc(64px + env(safe-area-inset-bottom) + 16px)",
          boxShadow: "0 6px 20px rgba(122, 27, 46, 0.28)",
        }}
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      {/* Bottom nav — 3 equal tabs */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--surface-raised)] border-t border-[var(--border)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex max-w-[640px] mx-auto">
          {tabs.map((tab) => (
            <TabButton
              key={tab.href}
              href={tab.href}
              label={tab.label}
              Icon={tab.Icon}
              active={tab.match(path)}
              onClick={() => router.push(tab.href)}
            />
          ))}
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
