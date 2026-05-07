import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import NativeShell from "@/components/NativeShell";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" });

export const metadata: Metadata = {
  title: "Winerary",
  description: "나만의 와인 다이어리 — 기록하고, 공유하고, 발견하세요",
  manifest: "/manifest.json",
  themeColor: "#881337",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Winerary",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${inter.variable} ${playfair.variable}`}>
      <body className="min-h-dvh flex flex-col selection:bg-rose-900 selection:text-rose-100">
        {children}
        <NativeShell />
      </body>
    </html>
  );
}
