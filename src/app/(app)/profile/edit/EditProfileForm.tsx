"use client";

import { useActionState } from "react";
import { updateNickname } from "@/lib/actions/profile";
import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";

export default function EditProfileForm({ currentNickname }: { currentNickname: string }) {
  const [state, formAction, isPending] = useActionState(updateNickname, undefined);

  if (state?.success) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <Check className="w-7 h-7 text-emerald-400" />
        </div>
        <p className="text-zinc-200 font-light">닉네임이 수정되었습니다</p>
        <Link
          href="/profile"
          className="text-accent text-sm hover:underline font-light mt-2"
        >
          마이페이지로 돌아가기
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label className="text-sm text-zinc-400 font-light">닉네임</label>
        <input
          name="nickname"
          type="text"
          defaultValue={currentNickname}
          required
          maxLength={20}
          className="w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3.5 text-zinc-100 focus:outline-none focus:border-accent focus:bg-black/60 transition-all font-light text-sm"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm text-zinc-400 font-light">비밀번호 확인</label>
        <input
          name="password"
          type="password"
          required
          placeholder="현재 비밀번호를 입력해 주세요"
          className="w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3.5 text-zinc-100 focus:outline-none focus:border-accent focus:bg-black/60 transition-all font-light text-sm placeholder:text-zinc-600"
        />
        <p className="text-xs text-zinc-600 font-light">본인 확인을 위해 비밀번호를 입력해 주세요</p>
      </div>

      {state?.error && (
        <p className="text-sm text-rose-400 font-light">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-4 rounded-2xl bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-medium transition-all shadow-lg shadow-accent/20 active:scale-[0.98] mt-2"
      >
        {isPending ? "수정 중..." : "수정하기"}
      </button>
    </form>
  );
}
