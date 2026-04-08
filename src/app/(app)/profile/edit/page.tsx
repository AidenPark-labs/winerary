import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import EditProfileForm from "./EditProfileForm";

export default async function EditProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?returnUrl=/profile/edit");

  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname")
    .eq("id", user.id)
    .single();

  return (
    <div className="flex flex-col">
      <header className="px-5 pt-12 pb-6 flex items-center gap-3">
        <Link
          href="/profile"
          className="w-9 h-9 rounded-full bg-surface/80 border border-white/5 flex items-center justify-center hover:border-white/10 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-zinc-400" />
        </Link>
        <h1 className="text-2xl font-bold">내 정보 수정</h1>
      </header>

      <div className="px-5 pb-28">
        <EditProfileForm currentNickname={profile?.nickname ?? ""} />
      </div>
    </div>
  );
}
