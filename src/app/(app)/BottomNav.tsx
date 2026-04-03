"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition, useEffect, useState } from "react";

const tabs = [
  { href: "/diary", label: "다이어리", icon: "📔" },
  { href: "/session/new", label: "세션", icon: "🍷" },
  { href: "/stats", label: "통계", icon: "📊" },
  { href: "/profile", label: "프로필", icon: "👤" },
];

export default function BottomNav() {
  const path = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // 탭 라우트 미리 prefetch
  useEffect(() => {
    tabs.forEach((tab) => router.prefetch(tab.href));
  }, [router]);

  // 네비게이션이 끝나면 pendingHref 초기화
  useEffect(() => {
    if (!isPending) setPendingHref(null);
  }, [isPending]);

  function handleTap(href: string) {
    if (pendingHref === href) return;
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950 border-t border-zinc-800 flex">
      {tabs.map((tab) => {
        const active = path === tab.href || (tab.href === "/diary" && path.startsWith("/diary"));
        const loading = isPending && pendingHref === tab.href;
        return (
          <button
            key={tab.href}
            onClick={() => handleTap(tab.href)}
            className={`flex-1 flex flex-col items-center py-3 gap-0.5 text-xs transition-colors ${
              active || loading ? "text-rose-400" : "text-zinc-500"
            }`}
          >
            <span className={`text-xl transition-transform duration-200 ${loading ? "scale-110" : "scale-100"}`}>
              {tab.icon}
            </span>
            {tab.label}
            {/* 로딩 중 탭 하단 인디케이터 */}
            <span className={`block h-0.5 w-4 rounded-full mt-0.5 transition-all duration-200 ${
              loading ? "bg-rose-500 opacity-100" : "opacity-0"
            }`} />
          </button>
        );
      })}
    </nav>
  );
}
