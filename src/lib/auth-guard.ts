import { createClient } from "@/lib/supabase/client";

/**
 * 클라이언트에서 로그인 여부를 확인합니다.
 * @returns true if authenticated
 */
export async function checkAuth(): Promise<boolean> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return !!user;
}
