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
        className="relative min-h-dvh flex flex-col text-foreground"
        style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}
      >
        {/* Atmospheric defocused blobs — fixed to viewport */}
        <div aria-hidden className="fixed inset-0 -z-0 overflow-hidden pointer-events-none">
          <div
            className="absolute -top-24 -right-20 w-[360px] h-[360px] rounded-full"
            style={{
              background: "radial-gradient(circle, #FAD4C0 0%, transparent 70%)",
              filter: "blur(60px)",
              opacity: 0.75,
            }}
          />
          <div
            className="absolute top-[35%] -left-24 w-[320px] h-[320px] rounded-full"
            style={{
              background: "radial-gradient(circle, #E8A98A 0%, transparent 70%)",
              filter: "blur(70px)",
              opacity: 0.55,
            }}
          />
          <div
            className="absolute bottom-[18%] right-[-60px] w-[300px] h-[300px] rounded-full"
            style={{
              background: "radial-gradient(circle, #7A1B2E 0%, transparent 70%)",
              filter: "blur(80px)",
              opacity: 0.28,
            }}
          />
          <div
            className="absolute top-[12%] left-[30%] w-[260px] h-[260px] rounded-full"
            style={{
              background: "radial-gradient(circle, #FFD8B8 0%, transparent 70%)",
              filter: "blur(70px)",
              opacity: 0.5,
            }}
          />
        </div>

        <main className="flex-1 pb-24 relative z-[1]">{children}</main>
        <BottomNav />
      </div>
    </>
  );
}
