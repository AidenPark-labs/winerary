"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const tabs = [
  { href: "/diary", label: "다이어리", icon: "📔" },
  { href: "/session/new", label: "세션", icon: "🍷" },
  { href: "/stats", label: "통계", icon: "📊" },
  { href: "/profile", label: "프로필", icon: "👤" },
];

export default function BottomNav() {
  const path = usePathname();
  const router = useRouter();
  const [tapping, setTapping] = useState<string | null>(null);

  function handleTap(href: string) {
    setTapping(href);
    router.push(href);
    setTimeout(() => setTapping(null), 400);
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950 border-t border-zinc-800 flex">
      {tabs.map((tab) => {
        const active = path === tab.href || (tab.href === "/diary" && path.startsWith("/diary"));
        const isTapping = tapping === tab.href;
        return (
          <button
            key={tab.href}
            onClick={() => handleTap(tab.href)}
            className={`flex-1 flex flex-col items-center py-3 gap-0.5 text-xs transition-all duration-150 ${
              active ? "text-rose-400" : "text-zinc-500"
            } ${isTapping ? "scale-90 opacity-60" : "scale-100 opacity-100"}`}
          >
            <span className={`text-xl transition-transform duration-150 ${isTapping ? "scale-110" : ""}`}>
              {tab.icon}
            </span>
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
