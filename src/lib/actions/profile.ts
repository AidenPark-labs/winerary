"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateNickname(
  _prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  const supabase = await createClient();
  const password = formData.get("password") as string;
  const nickname = (formData.get("nickname") as string).trim();

  if (!nickname) return { error: "닉네임을 입력해 주세요" };
  if (!password) return { error: "비밀번호를 입력해 주세요" };

  // 현재 사용자 확인
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: "로그인이 필요합니다" };

  // 비밀번호 검증 — 별도 클라이언트로 검증하여 기존 세션을 보존
  const verifyClient = await createClient();
  const { error: authError } = await verifyClient.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (authError) return { error: "비밀번호가 올바르지 않습니다" };

  // 닉네임 업데이트 (원래 세션의 supabase 클라이언트 사용)
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ nickname })
    .eq("id", user.id);

  if (updateError) return { error: "닉네임 수정에 실패했습니다. 다시 시도해 주세요" };

  revalidatePath("/profile");
  revalidatePath("/diary");

  return { success: true };
}
