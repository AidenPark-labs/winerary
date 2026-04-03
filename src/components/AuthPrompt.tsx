"use client";

import Link from "next/link";

export default function AuthPrompt({ message, returnUrl }: { message?: string; returnUrl?: string }) {
  const loginHref = returnUrl ? `/login?returnUrl=${encodeURIComponent(returnUrl)}` : "/login";
  const registerHref = returnUrl ? `/register?returnUrl=${encodeURIComponent(returnUrl)}` : "/register";

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center pb-24 bg-black/50 backdrop-blur-sm">
      <div className="mx-5 w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-6 text-center shadow-2xl">
        <div className="text-4xl mb-3">🍷</div>
        <h2 className="text-lg font-bold">로그인이 필요해요</h2>
        <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
          {message ?? "이 기능을 사용하려면 로그인이 필요합니다"}
        </p>
        <div className="flex flex-col gap-2.5 mt-5">
          <Link
            href={loginHref}
            className="w-full py-3 rounded-xl bg-rose-700 hover:bg-rose-600 text-white font-semibold transition-colors text-sm"
          >
            로그인
          </Link>
          <Link
            href={registerHref}
            className="w-full py-3 rounded-xl border border-zinc-700 hover:border-zinc-500 text-zinc-200 font-semibold transition-colors text-sm"
          >
            회원가입
          </Link>
          <Link
            href="/find"
            className="w-full py-2 text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
          >
            로그인 없이 둘러보기 →
          </Link>
        </div>
      </div>
    </div>
  );
}
