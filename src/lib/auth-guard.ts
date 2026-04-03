import { createClient } from "@/lib/supabase/client";

export async function checkAuth(): Promise<boolean> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return !!user;
}

export interface PendingAction {
  type: "wishlist_add";
  name_ko: string;
  name_en: string;
}

const PENDING_KEY = "winerary_pending_action";

export function setPendingAction(action: PendingAction) {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(action));
}

export function consumePendingAction(): PendingAction | null {
  const raw = sessionStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(PENDING_KEY);
  try { return JSON.parse(raw); } catch { return null; }
}
