"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition, useEffect, useState } from "react";
import { BookOpen, Search, Wine, Heart, User } from "lucide-react";

const tabs = [
  { href: "/diary", label: "와인노트", Icon: BookOpen },
  { href: "/find", label: "와인검색", Icon: Search },
  { href: "/recommend", label: "와인추천", Icon: Wine },
  { href: "/wishlist", label: "내 와인", Icon: Heart },
  { href: "/profile", label: "마이페이지", Icon: User },
];

// 탭 루트 경로 + 마이페이지 하위 허용 경로
const TAB_ROOTS = new Set(["/diary", "/find", "/recommend", "/wishlist", "/profile"]);
const PROFILE_SUB = ["/profile/edit"];

function isTabRoot(path: string) {
  if (TAB_ROOTS.has(path)) return true;
  if (PROFILE_SUB.some((p) => path.startsWith(p))) return true;
  return false;
}

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

  const visible = isTabRoot(path);

  if (!visible) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-t border-white/5 flex pb-safe">
      {tabs.map(({ href, label, Icon }) => {
        const active = path === href || (href === "/diary" && path.startsWith("/diary")) || (href === "/profile" && path === "/profile");
        const loading = isPending && pendingHref === href;
        return (
          <button
            key={href}
            onClick={() => handleTap(href)}
            className={`flex-1 flex flex-col items-center py-2.5 gap-1 text-[10px] sm:text-xs transition-all duration-300 ${
              active || loading ? "text-accent" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <div className={`transition-transform duration-300 ${loading ? "scale-110" : active ? "scale-105" : "scale-100"}`}>
              <Icon size={20} strokeWidth={active || loading ? 2.5 : 2} />
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
