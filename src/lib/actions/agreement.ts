"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function submitAgreement(_prevState: { error: string } | undefined, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다" };

  const birthYearRaw = formData.get("birthYear") as string;
  const birthYear = Number(birthYearRaw);
  if (!birthYear || isNaN(birthYear)) {
    return { error: "출생연도를 선택해 주세요" };
  }
  const currentYear = new Date().getFullYear();
  if (currentYear - birthYear < 19) {
    return { error: "만 19세 이상만 이용할 수 있습니다" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ birth_year: birthYear, agreed_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return { error: "저장에 실패했습니다. 다시 시도해 주세요" };

  redirect("/diary");
}
