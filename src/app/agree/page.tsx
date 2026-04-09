"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { submitAgreement } from "@/lib/actions/agreement";

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AgreePage() {
  const [state, action, pending] = useActionState(submitAgreement, undefined);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);

  const allAgreed = agreedTerms && agreedPrivacy;
  const canSubmit = agreedTerms && agreedPrivacy;

  function toggleAll() {
    const next = !allAgreed;
    setAgreedTerms(next);
    setAgreedPrivacy(next);
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-background">
      <div className="w-full max-w-sm bg-surface/60 backdrop-blur-2xl border border-white/5 rounded-[32px] p-8 shadow-2xl">
        <form action={action} className="flex flex-col gap-5">
          <div className="text-center mb-2">
            <span className="text-4xl">🍷</span>
            <h2 className="text-2xl font-serif text-white tracking-wide mt-3">추가 정보 입력</h2>
            <p className="text-sm text-zinc-500 mt-2 font-light">
              서비스 이용을 위해 아래 정보를 확인해 주세요
            </p>
          </div>

          {state?.error && (
            <p className="text-accent text-sm bg-accent/10 border border-accent/20 rounded-xl px-4 py-3 text-center">{state.error}</p>
          )}

          {/* 출생연도 */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="birthYear" className="text-xs font-medium text-zinc-400 ml-1">출생연도</label>
            <div className="relative">
              <select
                id="birthYear"
                name="birthYear"
                required
                defaultValue=""
                className="w-full appearance-none rounded-xl bg-black/40 border border-white/10 px-4 py-3.5 text-zinc-100 focus:outline-none focus:border-accent focus:bg-black/60 transition-all font-light"
              >
                <option value="" disabled className="text-zinc-600">출생연도 선택</option>
                {Array.from(
                  { length: new Date().getFullYear() - 19 - (new Date().getFullYear() - 100) + 1 },
                  (_, i) => new Date().getFullYear() - 19 - i
                ).map((year) => (
                  <option key={year} value={year}>{year}년</option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            </div>
          </div>

          {/* 약관 동의 */}
          <div className="flex flex-col gap-3 mt-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={allAgreed} onChange={toggleAll} className="sr-only peer" />
              <div className="w-5 h-5 rounded-md border border-white/20 bg-black/40 flex items-center justify-center peer-checked:bg-accent peer-checked:border-accent transition-all flex-shrink-0">
                {allAgreed && <CheckIcon />}
              </div>
              <span className="text-sm font-medium text-zinc-200">전체 동의</span>
            </label>

            <div className="h-px bg-white/5" />

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-3 cursor-pointer flex-1">
                <input type="checkbox" checked={agreedTerms} onChange={(e) => setAgreedTerms(e.target.checked)} className="sr-only peer" />
                <div className="w-5 h-5 rounded-md border border-white/20 bg-black/40 flex items-center justify-center peer-checked:bg-accent peer-checked:border-accent transition-all flex-shrink-0">
                  {agreedTerms && <CheckIcon />}
                </div>
                <span className="text-xs text-zinc-400">[필수] 서비스 이용약관 동의</span>
              </label>
              <Link href="/terms" target="_blank" className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors flex-shrink-0">보기</Link>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-3 cursor-pointer flex-1">
                <input type="checkbox" checked={agreedPrivacy} onChange={(e) => setAgreedPrivacy(e.target.checked)} className="sr-only peer" />
                <div className="w-5 h-5 rounded-md border border-white/20 bg-black/40 flex items-center justify-center peer-checked:bg-accent peer-checked:border-accent transition-all flex-shrink-0">
                  {agreedPrivacy && <CheckIcon />}
                </div>
                <span className="text-xs text-zinc-400">[필수] 개인정보처리방침 동의</span>
              </label>
              <Link href="/privacy" target="_blank" className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors flex-shrink-0">보기</Link>
            </div>
          </div>

          <button
            type="submit"
            disabled={pending || !canSubmit}
            className="w-full py-4 mt-2 rounded-2xl bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-medium transition-all shadow-lg shadow-accent/20 active:scale-[0.98]"
          >
            {pending ? "처리 중…" : "동의하고 계속하기"}
          </button>
        </form>
      </div>
    </div>
  );
}
