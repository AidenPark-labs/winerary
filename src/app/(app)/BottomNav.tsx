"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition, useEffect, useState } from "react";
import { BookOpen, Map, Search, Wine, User } from "lucide-react";

const tabs = [
  { href: "/diary", label: "와인노트", Icon: BookOpen },
  { href: "/wine-map", label: "와인맵", Icon: Map },
  { href: "/find", label: "와인검색", Icon: Search },
  { href: "/recommend", label: "와인추천", Icon: Wine },
  { href: "/profile", label: "마이페이지", Icon: User },
];

export default function BottomNav() {
  const path = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    tabs.forEach((tab) => router.prefetch(tab.href));
  }, [router]);

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
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-t border-white/5 flex pb-safe">
      {tabs.map(({ href, label, Icon }) => {
        const active = path === href || (href === "/diary" && path.startsWith("/diary")) || (href === "/wine-map" && path.startsWith("/wine-map")) || (href === "/profile" && path === "/profile");
        const loading = isPending && pendingHref === href;
        return (
          <button
            key={href}
            onClick={() => handleTap(href)}
            className={`flex-1 flex flex-col items-center py-4 gap-1.5 text-[10px] sm:text-xs transition-all duration-300 ${
              active || loading ? "text-accent" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <div className={`transition-transform duration-300 ${loading ? "scale-110" : active ? "scale-105" : "scale-100"}`}>
              <Icon size={22} strokeWidth={active || loading ? 2.5 : 2} />
            </div>
            <span className="font-medium tracking-wide">{label}</span>
            <span className={`absolute bottom-0 h-0.5 w-8 rounded-t-full transition-all duration-300 ${
              active || loading ? "bg-accent opacity-100 scale-x-100" : "opacity-0 scale-x-0"
            }`} />
          </button>
        );
      })}
    </nav>
  );
}
