import type { Metadata } from "next";
import BottomNav from "./_components/BottomNav";

export const metadata: Metadata = {
  title: "Winerary · 베타",
  description: "오늘의 한 잔을 남겨보세요",
};

export default function BetaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Pretendard Variable via CDN (prototype only; migrate to next/font/local before launch) */}
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
      />
      <div
        data-theme="beta"
        className="min-h-dvh flex flex-col bg-background text-foreground"
        style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}
      >
        <main className="flex-1 pb-24">{children}</main>
        <BottomNav />
      </div>
    </>
  );
}
