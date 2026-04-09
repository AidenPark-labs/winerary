"use client";

import { usePathname } from "next/navigation";
import BottomNav from "./BottomNav";

const TAB_ROOTS = new Set(["/diary", "/find", "/recommend", "/wishlist", "/profile"]);
const PROFILE_SUB = ["/profile/edit"];

function isTabRoot(path: string) {
  if (TAB_ROOTS.has(path)) return true;
  if (PROFILE_SUB.some((p) => path.startsWith(p))) return true;
  return false;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const hasNav = isTabRoot(path);

  return (
    <div className={`flex flex-col flex-1 ${hasNav ? "pb-16" : ""}`}>
      {children}
      <BottomNav />
    </div>
  );
}
