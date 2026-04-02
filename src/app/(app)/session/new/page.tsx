"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { createSession } from "@/lib/actions/session";

export default function NewSessionPage() {
  const router = useRouter();
  const [state, action, pending] = useActionState(createSession, undefined);

  return (
    <div className="flex flex-col">
      <header className="px-5 pt-12 pb-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-zinc-400 hover:text-zinc-200 text-2xl">←</button>
        <h1 className="text-xl font-bold">공유 세션 만들기</h1>
      </header>

      <div className="px-5 pb-8">
        <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
          세션을 만들면 고유 코드가 생성됩니다.<br />
          지인들에게 공유하면 실시간으로 함께 와인을 품평할 수 있어요.
        </p>

        <form action={action} className="flex flex-col gap-4">
          {state?.error && (
            <p className="text-rose-400 text-sm bg-rose-950/40 rounded-xl px-4 py-3">{state.error}</p>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="title" className="text-sm text-zinc-400">세션 제목 (선택)</label>
            <input
              id="title"
              name="title"
              className="rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-3 text-zinc-100 focus:outline-none focus:border-rose-600 transition-colors"
              placeholder="예: 오늘의 와인 파티 🍾"
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full py-4 rounded-2xl bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white font-semibold text-base transition-colors mt-4"
          >
            {pending ? "세션 생성 중…" : "세션 시작하기"}
          </button>
        </form>
      </div>
    </div>
  );
}
