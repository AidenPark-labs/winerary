/**
 * (D1) winery_en 클렌징을 DB에 반영
 *
 * - 원본 winery_en 보존
 * - raw_payload.winery_en_clean 추가
 * - 변경 없는 row는 skip
 * - concurrency 10으로 PATCH
 *
 * 실행: NODE_ENV=development npx tsx scripts/apply-winery-cleanup.ts
 *       옵션: --dry-run (실제 PATCH 안 함)
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const HEADERS = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const CONCURRENCY = 10;

// ─── 클렌징 규칙 (preview-winery-cleanup.ts와 동일) ────────────────────────

const SUFFIX_WORDS = new Set([
  "company","corp","corporation","group","holdings","inc","llc","ltd","co","pty","wine",
  "그룹","홀딩스",
]);

function clean(winery: string): string {
  let s = winery;
  s = s.replace(/\[[^\]]*\]/g, "");
  s = s.replace(/\{[^}]*\}/g, "");
  let parts = s.split(/\s+/).filter(Boolean);
  while (parts.length > 1) {
    const last = parts[parts.length - 1].toLowerCase().replace(/\.$/, "");
    if (SUFFIX_WORDS.has(last)) parts.pop();
    else break;
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

// ─── DB ────────────────────────────────────────────────────────────────────

async function fetchPage(offset: number, limit: number) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/raw_wines?source=eq.wine21&select=id,raw_payload&order=id.asc&offset=${offset}&limit=${limit}`,
    { headers: HEADERS }
  );
  if (!res.ok) throw new Error(`fetchPage ${res.status}`);
  return (await res.json()) as Array<{ id: string; raw_payload: Record<string, unknown> | null }>;
}

async function patchRow(id: string, merged: Record<string, unknown>): Promise<void> {
  if (DRY_RUN) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/raw_wines?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...HEADERS, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ raw_payload: merged }),
  });
  if (!res.ok) throw new Error(`PATCH ${res.status} id=${id}`);
}

// ─── 메인 ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🧽 winery_en_clean 반영 시작 (DRY=${DRY_RUN})\n`);

  const PAGE = 1000;
  let offset = 0;
  let scanned = 0, changed = 0, patched = 0, errors = 0, skippedSame = 0;
  const start = Date.now();

  while (true) {
    const rows = await fetchPage(offset, PAGE);
    if (!rows.length) break;

    // 변경 대상만 추출
    const tasks: Array<{ id: string; payload: Record<string, unknown> }> = [];
    for (const r of rows) {
      scanned++;
      const p = r.raw_payload ?? {};
      const w = (p.winery_en as string | undefined) ?? "";
      if (!w) continue;
      const c = clean(w);
      if (c === w) { skippedSame++; continue; }
      changed++;
      tasks.push({ id: r.id, payload: { ...p, winery_en_clean: c } });
    }

    // 병렬 PATCH
    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
      const group = tasks.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(group.map((t) => patchRow(t.id, t.payload)));
      for (const r of results) {
        if (r.status === "fulfilled") patched++;
        else { errors++; console.error(`\n  ⚠ ${(r.reason as Error).message}`); }
      }
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      process.stdout.write(`\r  scanned=${scanned} changed=${changed} patched=${patched} errors=${errors} (${elapsed}s)     `);
    }

    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n\n========== 완료 ==========`);
  console.log(`scan: ${scanned}`);
  console.log(`  변경 동일로 skip: ${skippedSame}`);
  console.log(`  변경 필요: ${changed}`);
  console.log(`  patched: ${patched}`);
  console.log(`  errors: ${errors}`);
  console.log(`소요: ${elapsed}s`);
  if (DRY_RUN) console.log("\n⚠ DRY_RUN 모드 — 실제 DB 변경 없음");
}

main().catch((e) => { console.error("\n❌", e); process.exit(1); });
