"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { createSession } from "@/lib/actions/session";

export default function NewSessionPage() {
  const router = useRouter();
  const [state, action, pending] = useActionState(createSession, undefined);

  return (
    <div className="flex flex-col">
      <header className="px-5 pt-8 pb-2 flex items-center gap-3">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/20 transition-colors text-lg">←</button>
        <h1 className="text-xl font-bold">공유 세션 만들기</h1>
      </header>

      <div className="px-5 pb-8">
        <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
          세션을 만들면 고유 코드가 생성됩니다.<br />
          지인들에게 공유하면 실시간으로 함께 와인을 품평할 수 있어요.
        </p>

        <form action={action} className="flex flex-col gap-4">
          {state?.error && (
            <p className="text-accent text-sm bg-accent/20 rounded-xl px-4 py-3 border border-accent/40">{state.error}</p>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="title" className="text-sm text-zinc-400 font-light">세션 제목 (선택)</label>
            <input
              id="title"
              name="title"
              className="rounded-xl bg-surface border border-white/10 px-4 py-3 text-zinc-100 font-light focus:outline-none focus:border-accent transition-all shadow-sm"
              placeholder="예: 오늘의 와인 파티 🍷"
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full py-4 rounded-2xl bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-medium text-base transition-all mt-4 shadow-lg shadow-accent/20 active:scale-[0.98]"
          >
            {pending ? "세션 생성 중…" : "세션 시작하기"}
          </button>
        </form>
      </div>
    </div>
  );
}
