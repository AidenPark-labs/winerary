"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { register } from "@/lib/actions/auth";

export default function RegisterPage() {
  const [state, action, pending] = useActionState(register, undefined);
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl") ?? "";

  return (
    <form action={action} className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold mb-2">회원가입</h2>
      {returnUrl && <input type="hidden" name="returnUrl" value={returnUrl} />}

      {state?.error && (
        <p className="text-rose-400 text-sm bg-rose-950/40 rounded-lg px-3 py-2">{state.error}</p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="nickname" className="text-sm text-zinc-400">닉네임</label>
        <input
          id="nickname"
          name="nickname"
          type="text"
          required
          className="rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-3 text-zinc-100 focus:outline-none focus:border-rose-600 transition-colors"
          placeholder="와인러버"
        />
      </div>

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
          minLength={6}
          autoComplete="new-password"
          className="rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-3 text-zinc-100 focus:outline-none focus:border-rose-600 transition-colors"
          placeholder="6자 이상"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full py-3 rounded-xl bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white font-semibold transition-colors mt-2"
      >
        {pending ? "가입 중…" : "가입하기"}
      </button>

      <p className="text-center text-sm text-zinc-500">
        이미 계정이 있으신가요?{" "}
        <Link href={returnUrl ? `/login?returnUrl=${encodeURIComponent(returnUrl)}` : "/login"} className="text-rose-400 hover:underline">로그인</Link>
      </p>
    </form>
  );
}
