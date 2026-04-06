import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/diary");

  return (
    <main className="relative flex flex-col items-center justify-center flex-1 px-6 py-20 text-center overflow-hidden">
      {/* Background Image layer */}
      <div className="absolute inset-0 z-0">
        <Image 
          src="/hero-bg.png" 
          alt="Premium Wine Glass" 
          fill 
          priority
          className="object-cover opacity-60 object-[center_30%]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
      </div>

      <div className="z-10 flex flex-col items-center max-w-sm mt-auto mb-12">
        <div className="backdrop-blur-xl bg-surface/30 p-8 rounded-3xl border border-white/5 shadow-2xl flex flex-col items-center w-full">
          <h1 className="text-5xl font-bold tracking-tight mb-4 font-serif text-white drop-shadow-md">Winerary</h1>
          <p className="text-zinc-300 text-lg mb-10 leading-relaxed font-light">
            마신 와인을 기록하고,<br />지인과 실시간으로 공유하세요
          </p>
          
          <div className="flex flex-col gap-3 w-full">
            <Link
              href="/login"
              className="w-full py-3.5 rounded-2xl bg-accent/90 hover:bg-accent text-white font-medium transition-all shadow-lg shadow-accent/20 active:scale-[0.98]"
            >
              로그인
            </Link>
            <Link
              href="/register"
              className="w-full py-3.5 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 text-white font-medium transition-all active:scale-[0.98]"
            >
              회원가입
            </Link>
            <Link
              href="/find"
              className="w-full py-3 rounded-xl text-zinc-400 hover:text-white text-sm transition-colors mt-2"
            >
              로그인 없이 둘러보기 →
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
