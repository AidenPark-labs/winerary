import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/diary");

  return (
    <main className="flex flex-col items-center justify-center flex-1 px-6 py-20 text-center">
      <div className="mb-6 text-5xl">🍷</div>
      <h1 className="text-4xl font-bold tracking-tight mb-3">Winerary</h1>
      <p className="text-zinc-400 text-lg mb-10 max-w-sm leading-relaxed">
        마신 와인을 기록하고,<br />지인과 실시간으로 공유하세요
      </p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Link
          href="/login"
          className="w-full py-3 rounded-xl bg-rose-700 hover:bg-rose-600 text-white font-semibold transition-colors"
        >
          로그인
        </Link>
        <Link
          href="/register"
          className="w-full py-3 rounded-xl border border-zinc-700 hover:border-zinc-500 text-zinc-200 font-semibold transition-colors"
        >
          회원가입
        </Link>
      </div>
    </main>
  );
}
