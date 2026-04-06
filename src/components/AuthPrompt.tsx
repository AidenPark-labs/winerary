"use client";

import Link from "next/link";
import { Lock } from "lucide-react";

export default function AuthPrompt({ message, returnUrl }: { message?: string; returnUrl?: string }) {
  const loginHref = returnUrl ? `/login?returnUrl=${encodeURIComponent(returnUrl)}` : "/login";
  const registerHref = returnUrl ? `/register?returnUrl=${encodeURIComponent(returnUrl)}` : "/register";

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center pb-24 bg-black/60 backdrop-blur-md">
      <div className="mx-5 w-full max-w-sm rounded-[32px] bg-surface/80 border border-white/10 p-8 text-center shadow-2xl backdrop-blur-xl">
        <div className="mx-auto w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-5 border border-white/10">
          <Lock className="text-zinc-300" size={28} strokeWidth={1.5} />
        </div>
        <h2 className="text-xl font-serif text-white tracking-wide">로그인이 필요해요</h2>
        <p className="text-sm text-zinc-400 mt-2.5 leading-relaxed font-light">
          {message ?? "이 기능을 사용하려면 로그인이 필요합니다"}
        </p>
        <div className="flex flex-col gap-3 mt-8">
          <Link
            href={loginHref}
            className="w-full py-4 rounded-xl bg-accent hover:bg-accent/90 text-white font-medium transition-all shadow-lg shadow-accent/20 active:scale-[0.98]"
          >
            로그인
          </Link>
          <Link
            href={registerHref}
            className="w-full py-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white font-medium transition-all active:scale-[0.98]"
          >
            회원가입
          </Link>
          <Link
            href="/find"
            className="w-full py-3 text-zinc-500 hover:text-white text-xs transition-colors"
          >
            로그인 없이 둘러보기 →
          </Link>
        </div>
      </div>
    </div>
  );
}
