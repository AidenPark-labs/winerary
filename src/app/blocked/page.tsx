"use client";

import { logout } from "@/lib/actions/auth";

export default function BlockedPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-background">
      <div className="w-full max-w-sm bg-surface/60 backdrop-blur-2xl border border-white/5 rounded-[32px] p-8 shadow-2xl text-center">
        <span className="text-5xl">🚫</span>
        <h2 className="text-xl font-bold text-white mt-4">이용이 제한되었습니다</h2>
        <p className="text-sm text-zinc-400 mt-3 font-light leading-relaxed">
          본 서비스는 「청소년보호법」에 따라<br />
          <strong className="text-zinc-200">만 19세 이상</strong>만 이용할 수 있습니다.
        </p>
        <p className="text-xs text-zinc-600 mt-4 leading-relaxed">
          입력하신 출생연도 기준으로 만 19세 미만에 해당하여<br />
          서비스 이용이 제한됩니다.
        </p>
        <form action={logout} className="mt-6">
          <button
            type="submit"
            className="w-full py-3.5 rounded-2xl bg-white/10 hover:bg-white/15 text-zinc-300 font-medium transition-all active:scale-[0.98]"
          >
            로그아웃
          </button>
        </form>
      </div>
    </div>
  );
}
