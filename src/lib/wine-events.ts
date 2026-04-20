import "server-only";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export type WineEventType = "view" | "record" | "wishlist";

let _service: ReturnType<typeof createServiceClient> | null = null;
function service() {
  if (!_service) {
    _service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
  }
  return _service;
}

export async function logWineEvent(params: {
  wineId: string;
  eventType: WineEventType;
  userId?: string | null;
  sessionId?: string | null;
}): Promise<void> {
  try {
    const row = {
      wine_id: params.wineId,
      event_type: params.eventType,
      user_id: params.userId ?? null,
      session_id: params.sessionId ?? null,
    };
    await (service().from("wine_events") as unknown as {
      insert: (v: typeof row) => Promise<unknown>;
    }).insert(row);
  } catch {
    // 이벤트 로깅 실패는 요청을 막지 않는다
  }
}
