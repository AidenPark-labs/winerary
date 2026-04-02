import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import SessionClient from "./SessionClient";

export default async function SessionPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("*")
    .eq("code", code)
    .single();

  if (!session) notFound();

  const { data: evaluations } = await supabase
    .from("session_evaluations")
    .select("*")
    .eq("session_id", session.id)
    .order("created_at", { ascending: true });

  const { data: comments } = await supabase
    .from("session_comments")
    .select("*")
    .eq("session_id", session.id)
    .order("created_at", { ascending: true });

  const { data: { user } } = await supabase.auth.getUser();
  let nickname = "익명";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("nickname")
      .eq("id", user.id)
      .single();
    if (profile) nickname = profile.nickname;
  }

  return (
    <SessionClient
      session={session}
      initialEvaluations={evaluations ?? []}
      initialComments={comments ?? []}
      currentUserId={user?.id ?? null}
      nickname={nickname}
    />
  );
}
