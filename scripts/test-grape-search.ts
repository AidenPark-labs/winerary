/**
 * 품종 변형 표기로 search_wines 테스트 (READ-ONLY)
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function test(q: string) {
  const { data, error } = await sb.rpc("search_wines", { q, k: 5 });
  if (error) { console.log(`❌ "${q}": ${error.message}`); return; }
  const rows = (data as Array<{ id: string }>) ?? [];
  if (rows.length === 0) { console.log(`⚠  "${q}" → 결과 0건`); return; }
  const { data: wines } = await sb.from("wines").select("id, name_ko").in("id", rows.map((r) => r.id));
  const byId = new Map((wines ?? []).map((w) => [w.id as string, w.name_ko as string]));
  console.log(`✓ "${q}" → ${rows.length}건`);
  rows.slice(0, 3).forEach((r) => console.log(`    - ${byId.get(r.id)}`));
}

async function main() {
  console.log("═══ 변형 표기 검색 테스트 ═══\n");
  for (const q of [
    "카버네 쇼비뇽",
    "까베르네 쇼비뇽",
    "카베르네 쇼비뇽",
    "카버네 소비뇽",
    "까베르네 소비뇽",   // 표준 (대조군)
    "리즐링",
    "리슬링",              // 표준 (대조군)
  ]) {
    await test(q);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
