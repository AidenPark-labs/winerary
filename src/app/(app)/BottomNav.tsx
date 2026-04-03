"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/diary", label: "다이어리", icon: "📔" },
  { href: "/session/new", label: "세션", icon: "🍷" },
  { href: "/stats", label: "통계", icon: "📊" },
  { href: "/profile", label: "프로필", icon: "👤" },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950 border-t border-zinc-800 flex">
      {tabs.map((tab) => {
        const active = path === tab.href || (tab.href === "/diary" && path.startsWith("/diary"));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 flex flex-col items-center py-3 gap-0.5 text-xs transition-colors ${
              active ? "text-rose-400" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <span className="text-xl">{tab.icon}</span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
