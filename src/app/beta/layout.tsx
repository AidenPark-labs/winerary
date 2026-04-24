import type { Metadata } from "next";
import BottomNav from "./_components/BottomNav";

export const metadata: Metadata = {
  title: "Winerary · 베타",
  description: "오늘의 한 잔을 남겨보세요",
};

export default function BetaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Pretendard Variable + Noto Serif KR (prototype CDN) */}
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
      />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;500;600;700&display=swap"
      />
      <div
        data-theme="beta"
        className="min-h-dvh flex flex-col text-foreground"
        style={{
          background: "#FDFBF6",
          fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
        }}
      >
        <main className="flex-1 pb-24">{children}</main>
        <BottomNav />
      </div>
    </>
  );
}
