import { createClient } from "@/lib/supabase/client";

/**
 * 클라이언트에서 로그인 여부를 확인하고, 미인증 시 로그인 페이지로 이동합니다.
 * @returns true if authenticated, false if redirecting to login
 */
export async function requireAuth(): Promise<boolean> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    window.location.href = "/login";
    return false;
  }
  return true;
}
