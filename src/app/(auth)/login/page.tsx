"use client";

import { useActionState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { login } from "@/lib/actions/auth";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl") ?? "";

  return (
    <form action={action} className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold mb-2">로그인</h2>
      {returnUrl && <input type="hidden" name="returnUrl" value={returnUrl} />}

      {state?.error && (
        <p className="text-rose-400 text-sm bg-rose-950/40 rounded-lg px-3 py-2">{state.error}</p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm text-zinc-400">이메일</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-3 text-zinc-100 focus:outline-none focus:border-rose-600 transition-colors"
          placeholder="wine@example.com"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm text-zinc-400">비밀번호</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-3 text-zinc-100 focus:outline-none focus:border-rose-600 transition-colors"
          placeholder="••••••••"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full py-3 rounded-xl bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white font-semibold transition-colors mt-2"
      >
        {pending ? "로그인 중…" : "로그인"}
      </button>

      <p className="text-center text-sm text-zinc-500">
        계정이 없으신가요?{" "}
        <Link href={returnUrl ? `/register?returnUrl=${encodeURIComponent(returnUrl)}` : "/register"} className="text-rose-400 hover:underline">회원가입</Link>
      </p>
    </form>
  );
}
