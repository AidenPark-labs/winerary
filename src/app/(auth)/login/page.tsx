"use client";

import { useActionState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { login } from "@/lib/actions/auth";

export default function LoginPage() {
  return (
    <Suspense>
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-background">
        <div className="w-full max-w-sm bg-surface/60 backdrop-blur-2xl border border-white/5 rounded-[32px] p-8 shadow-2xl">
          <LoginForm />
        </div>
      </div>
    </Suspense>
  );
}

function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl") ?? "";

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="text-center mb-4">
        <h2 className="text-3xl font-serif text-white tracking-wide">Welcome</h2>
        <p className="text-sm text-zinc-500 mt-2 font-light">다시 뵙게 되어 반갑습니다.</p>
      </div>

      {returnUrl && <input type="hidden" name="returnUrl" value={returnUrl} />}

      {state?.error && (
        <p className="text-accent text-sm bg-accent/10 border border-accent/20 rounded-xl px-4 py-3 text-center">{state.error}</p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-xs font-medium text-zinc-400 ml-1">이메일</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-xl bg-black/40 border border-white/10 px-4 py-3.5 text-zinc-100 focus:outline-none focus:border-accent focus:bg-black/60 transition-all font-light"
          placeholder="wine@example.com"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-xs font-medium text-zinc-400 ml-1">비밀번호</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="rounded-xl bg-black/40 border border-white/10 px-4 py-3.5 text-zinc-100 focus:outline-none focus:border-accent focus:bg-black/60 transition-all font-light"
          placeholder="••••••••"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full py-4 mt-4 rounded-2xl bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-medium transition-all shadow-lg shadow-accent/20 active:scale-[0.98]"
      >
        {pending ? "로그인 중…" : "로그인"}
      </button>

      <p className="text-center text-sm text-zinc-500 mt-2 font-light">
        계정이 없으신가요?{" "}
        <Link href={returnUrl ? `/register?returnUrl=${encodeURIComponent(returnUrl)}` : "/register"} className="text-white hover:text-accent font-medium transition-colors">
          회원가입
        </Link>
      </p>
    </form>
  );
}
