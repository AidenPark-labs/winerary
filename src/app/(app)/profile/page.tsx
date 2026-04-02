import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LogoutButton from "./LogoutButton";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { count: recordCount } = await supabase
    .from("wine_records")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("deleted_at", null);

  const { count: sessionCount } = await supabase
    .from("sessions")
    .select("*", { count: "exact", head: true })
    .eq("host_id", user.id);

  return (
    <div className="flex flex-col">
      <header className="px-5 pt-12 pb-6">
        <h1 className="text-2xl font-bold">프로필</h1>
      </header>

      <div className="px-5 pb-8 flex flex-col gap-6">
        {/* Avatar + info */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-rose-900 flex items-center justify-center text-2xl">
            {profile?.nickname?.[0] ?? "🍷"}
          </div>
          <div>
            <p className="text-xl font-bold">{profile?.nickname ?? "사용자"}</p>
            <p className="text-sm text-zinc-500">{user.email}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 text-center">
            <p className="text-3xl font-bold text-rose-400">{recordCount ?? 0}</p>
            <p className="text-xs text-zinc-500 mt-1">기록한 와인</p>
          </div>
          <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 text-center">
            <p className="text-3xl font-bold text-rose-400">{sessionCount ?? 0}</p>
            <p className="text-xs text-zinc-500 mt-1">공유 세션</p>
          </div>
        </div>

        {/* Links */}
        <div className="flex flex-col gap-2">
          <a
            href="/diary"
            className="flex items-center justify-between px-4 py-3.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors"
          >
            <span className="text-sm">내 와인 다이어리</span>
            <span className="text-zinc-500">→</span>
          </a>
          <a
            href="/stats"
            className="flex items-center justify-between px-4 py-3.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors"
          >
            <span className="text-sm">통계 보기</span>
            <span className="text-zinc-500">→</span>
          </a>
        </div>

        <LogoutButton />
      </div>
    </div>
  );
}
