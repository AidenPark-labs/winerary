/**
 * vivino_url 또는 vivino_page_url에 `/search/`가 들어 있는 행의 vivino_* 필드를 일괄 NULL.
 * 백업 JSON을 프로젝트 루트에 저장한 뒤 수행.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const VIVINO_FIELDS = [
  "vivino_url",
  "vivino_page_url",
  "vivino_wine_id",
  "vivino_rating",
  "vivino_reviews",
  "vivino_winery",
  "vivino_grapes",
  "vivino_region",
  "vivino_style",
  "vivino_alcohol",
  "vivino_description",
  "vivino_allergens",
  "vivino_name",
  "vivino_needs_review",
  "vivino_reviewed_at",
] as const;

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  // 1. 대상 행 조회 (백업 포함 모든 vivino_* 필드)
  const selectCols = ["id", "name_ko", "name_en", "source", "data_source", ...VIVINO_FIELDS].join(", ");
  const { data: rows, error: selErr } = await sb
    .from("wines")
    .select(selectCols)
    .or("vivino_url.like.%/search/%,vivino_page_url.like.%/search/%");

  if (selErr) {
    console.error("SELECT 실패:", selErr);
    process.exit(1);
  }

  const targets = rows ?? [];
  console.log(`대상 행: ${targets.length}건`);

  if (targets.length === 0) {
    console.log("정리할 행이 없습니다.");
    return;
  }

  // 2. 백업 JSON
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `vivino-search-url-backup-${ts}.json`;
  writeFileSync(backupPath, JSON.stringify(targets, null, 2));
  console.log(`백업 저장: ${backupPath}`);

  if (dryRun) {
    console.log("(--dry-run) UPDATE 스킵");
    return;
  }

  // 3. UPDATE — vivino_* 일괄 NULL + needs_review=false + reviewed_at=now (정리됨 표시)
  const now = new Date().toISOString();
  const ids = targets.map((r: any) => r.id);
  const CHUNK = 200;
  let updated = 0;

  const patch: Record<string, unknown> = {
    vivino_url: null,
    vivino_page_url: null,
    vivino_wine_id: null,
    vivino_rating: null,
    vivino_reviews: null,
    vivino_winery: null,
    vivino_grapes: null,
    vivino_region: null,
    vivino_style: null,
    vivino_alcohol: null,
    vivino_description: null,
    vivino_allergens: null,
    vivino_name: null,
    vivino_needs_review: false,
    vivino_reviewed_at: now,
    updated_at: now,
  };

  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { error: updErr, count } = await sb
      .from("wines")
      .update(patch, { count: "exact" })
      .in("id", slice);
    if (updErr) {
      console.error(`UPDATE chunk ${i / CHUNK + 1} 실패:`, updErr);
      process.exit(1);
    }
    updated += count ?? slice.length;
    console.log(`  ${updated}/${ids.length} 처리`);
  }

  console.log(`\n완료. ${updated}건 NULL 처리.`);
  console.log("롤백: scripts/restore-vivino-from-raw.ts (raw_payload에서 일부 복구) 또는 위 백업 JSON 사용.");
}

main().catch((e) => { console.error(e); process.exit(1); });
