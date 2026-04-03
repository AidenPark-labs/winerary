"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

function toKorean(message: string): string {
  const map: [string, string][] = [
    ["Invalid login credentials", "이메일 또는 비밀번호가 올바르지 않습니다"],
    ["Email not confirmed", "이메일 인증이 필요합니다. 받은편지함을 확인해 주세요"],
    ["User already registered", "이미 가입된 이메일입니다"],
    ["Password should be at least 6 characters", "비밀번호는 6자 이상이어야 합니다"],
    ["Signup requires a valid password", "유효한 비밀번호를 입력해 주세요"],
    ["Unable to validate email address", "이메일 형식이 올바르지 않습니다"],
    ["Email rate limit exceeded", "이메일 발송 한도를 초과했습니다. 잠시 후 다시 시도해 주세요"],
    ["over_email_send_rate_limit", "잠시 후 다시 시도해 주세요"],
    ["For security purposes", "보안을 위해 잠시 후 다시 시도해 주세요"],
    ["Anonymous sign-ins are disabled", "익명 로그인이 비활성화되어 있습니다"],
    ["Token has expired", "세션이 만료되었습니다. 다시 로그인해 주세요"],
    ["Network request failed", "네트워크 오류가 발생했습니다. 인터넷 연결을 확인해 주세요"],
  ];
  for (const [en, ko] of map) {
    if (message.toLowerCase().includes(en.toLowerCase())) return ko;
  }
  return message;
}

export async function login(_prevState: { error: string } | undefined, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  });
  if (error) return { error: toKorean(error.message) };
  const returnUrl = formData.get("returnUrl") as string;
  redirect(returnUrl || "/diary");
}

export async function register(_prevState: { error: string } | undefined, formData: FormData) {
  const supabase = await createClient();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const nickname = formData.get("nickname") as string;

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: toKorean(error.message) };

  if (data.user) {
    const { error: profileError } = await supabase
      .from("profiles")
      .insert({ id: data.user.id, nickname });
    if (profileError) return { error: "프로필 생성에 실패했습니다. 다시 시도해 주세요" };
  }
  const returnUrl = formData.get("returnUrl") as string;
  redirect(returnUrl || "/diary");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
