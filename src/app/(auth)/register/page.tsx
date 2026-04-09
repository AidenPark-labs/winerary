"use client";

import { useActionState, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { register } from "@/lib/actions/auth";
import { ChevronDown } from "lucide-react";

export default function RegisterPage() {
  return (
    <Suspense>
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-background">
        <div className="w-full max-w-sm bg-surface/60 backdrop-blur-2xl border border-white/5 rounded-[32px] p-8 shadow-2xl">
          <RegisterForm />
        </div>
      </div>
    </Suspense>
  );
}

function MinorDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-6">
      <div className="w-full max-w-xs bg-surface border border-white/10 rounded-2xl p-6 text-center shadow-2xl">
        <span className="text-4xl">🚫</span>
        <h3 className="text-lg font-bold text-white mt-3">이용이 제한됩니다</h3>
        <p className="text-sm text-zinc-400 mt-2 font-light leading-relaxed">
          본 서비스는 「청소년보호법」에 따라<br />
          <strong className="text-zinc-200">만 19세 이상</strong>만 이용할 수 있습니다.
        </p>
        <button
          onClick={onClose}
          className="w-full mt-5 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-300 font-medium transition-all active:scale-[0.98]"
        >
          확인
        </button>
      </div>
    </div>
  );
}

function BirthYearSelect({ onMinor }: { onMinor: () => void }) {
  const currentYear = new Date().getFullYear();
  const minYear = currentYear - 100;
  const maxYear = currentYear - 1;

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const year = Number(e.target.value);
    if (year && currentYear - year < 19) {
      e.target.value = "";
      onMinor();
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="birthYear" className="text-xs font-medium text-zinc-400 ml-1">출생연도</label>
      <div className="relative">
        <select
          id="birthYear"
          name="birthYear"
          required
          defaultValue=""
          onChange={handleChange}
          className="w-full appearance-none rounded-xl bg-black/40 border border-white/10 px-4 py-3.5 text-zinc-100 focus:outline-none focus:border-accent focus:bg-black/60 transition-all font-light"
        >
          <option value="" disabled className="text-zinc-600">출생연도 선택</option>
          {Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i).map((year) => (
            <option key={year} value={year}>{year}년</option>
          ))}
        </select>
        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
      </div>
    </div>
  );
}

function AgreementSection({
  agreedTerms,
  agreedPrivacy,
  onTermsChange,
  onPrivacyChange,
}: {
  agreedTerms: boolean;
  agreedPrivacy: boolean;
  onTermsChange: (v: boolean) => void;
  onPrivacyChange: (v: boolean) => void;
}) {
  const allAgreed = agreedTerms && agreedPrivacy;

  function toggleAll() {
    const next = !allAgreed;
    onTermsChange(next);
    onPrivacyChange(next);
  }

  return (
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
          <input type="checkbox" checked={agreedTerms} onChange={(e) => onTermsChange(e.target.checked)} className="sr-only peer" />
          <div className="w-5 h-5 rounded-md border border-white/20 bg-black/40 flex items-center justify-center peer-checked:bg-accent peer-checked:border-accent transition-all flex-shrink-0">
            {agreedTerms && <CheckIcon />}
          </div>
          <span className="text-xs text-zinc-400">[필수] 서비스 이용약관 동의</span>
        </label>
        <Link href="/terms" target="_blank" className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors flex-shrink-0">보기</Link>
      </div>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-3 cursor-pointer flex-1">
          <input type="checkbox" checked={agreedPrivacy} onChange={(e) => onPrivacyChange(e.target.checked)} className="sr-only peer" />
          <div className="w-5 h-5 rounded-md border border-white/20 bg-black/40 flex items-center justify-center peer-checked:bg-accent peer-checked:border-accent transition-all flex-shrink-0">
            {agreedPrivacy && <CheckIcon />}
          </div>
          <span className="text-xs text-zinc-400">[필수] 개인정보처리방침 동의</span>
        </label>
        <Link href="/privacy" target="_blank" className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors flex-shrink-0">보기</Link>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RegisterForm() {
  const [state, action, pending] = useActionState(register, undefined);
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl") ?? "";
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [showMinorDialog, setShowMinorDialog] = useState(false);

  const canSubmit = agreedTerms && agreedPrivacy;

  return (
    <>
      {showMinorDialog && <MinorDialog onClose={() => setShowMinorDialog(false)} />}
      <form action={action} className="flex flex-col gap-5">
        <div className="text-center mb-4">
          <h2 className="text-3xl font-serif text-white tracking-wide">Join Us</h2>
          <p className="text-sm text-zinc-500 mt-2 font-light">나만의 와인 셀러를 시작해보세요</p>
        </div>

        {returnUrl && <input type="hidden" name="returnUrl" value={returnUrl} />}

        {state?.error && (
          <p className="text-accent text-sm bg-accent/10 border border-accent/20 rounded-xl px-4 py-3 text-center">{state.error}</p>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="nickname" className="text-xs font-medium text-zinc-400 ml-1">닉네임</label>
          <input
            id="nickname"
            name="nickname"
            type="text"
            required
            className="rounded-xl bg-black/40 border border-white/10 px-4 py-3.5 text-zinc-100 focus:outline-none focus:border-accent focus:bg-black/60 transition-all font-light"
            placeholder="와인러버"
          />
        </div>

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
            minLength={6}
            autoComplete="new-password"
            className="rounded-xl bg-black/40 border border-white/10 px-4 py-3.5 text-zinc-100 focus:outline-none focus:border-accent focus:bg-black/60 transition-all font-light"
            placeholder="6자 이상"
          />
        </div>

        <BirthYearSelect onMinor={() => setShowMinorDialog(true)} />

        <AgreementSection
          agreedTerms={agreedTerms}
          agreedPrivacy={agreedPrivacy}
          onTermsChange={setAgreedTerms}
          onPrivacyChange={setAgreedPrivacy}
        />

        <button
          type="submit"
          disabled={pending || !canSubmit}
          className="w-full py-4 mt-2 rounded-2xl bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-medium transition-all shadow-lg shadow-accent/20 active:scale-[0.98]"
        >
          {pending ? "가입 중…" : "가입하기"}
        </button>

        <p className="text-center text-sm text-zinc-500 mt-2 font-light">
          이미 계정이 있으신가요?{" "}
          <Link href={returnUrl ? `/login?returnUrl=${encodeURIComponent(returnUrl)}` : "/login"} className="text-white hover:text-accent font-medium transition-colors">
            로그인
          </Link>
        </p>
      </form>
    </>
  );
}
