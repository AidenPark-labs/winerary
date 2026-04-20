/**
 * (B) winery_en 클렌징 preview
 *
 * 클렌징 규칙:
 *   1. 대괄호/중괄호 및 내용 제거: [B2B], [Domaine X], {...}
 *      (소괄호는 정당한 보조정보 있을 수 있어 보존)
 *   2. 끝에 붙은 법인 suffix 반복 제거:
 *      Company|Corp|Corporation|Group|Holdings|Inc|LLC|Ltd|Co|Pty|wine|그룹|홀딩스
 *   3. 다중공백 → 단일공백, trim
 *
 * DB 쓰지 않음. 결과만 리포트 + /tmp/winery-cleanup-preview.json 저장.
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
config({ path: ".env.local" });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const SUFFIX_WORDS = new Set([
  "company","corp","corporation","group","holdings","inc","llc","ltd","co","pty","wine",
  "그룹","홀딩스",
]);

function clean(winery: string): string {
  let s = winery;
  // 대괄호/중괄호 + 내용 제거
  s = s.replace(/\[[^\]]*\]/g, "");
  s = s.replace(/\{[^}]*\}/g, "");
  // 끝에서 suffix 단어 반복 제거
  let parts = s.split(/\s+/).filter(Boolean);
  while (parts.length > 1) {
    const last = parts[parts.length - 1].toLowerCase().replace(/\.$/, "");
    if (SUFFIX_WORDS.has(last)) parts.pop();
    else break;
  }
  s = parts.join(" ");
  // 다중공백/특수 trim
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

async function main() {
  console.log("🧽 winery_en 클렌징 preview\n");

  const all: Array<{ id: string; original: string; cleaned: string }> = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb.from("raw_wines")
      .select("id, raw_payload")
      .eq("source", "wine21")
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      const w = ((r.raw_payload as Record<string, unknown>)?.winery_en as string | undefined) ?? "";
      if (!w) continue;
      const c = clean(w);
      all.push({ id: r.id, original: w, cleaned: c });
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  const changed = all.filter((r) => r.original !== r.cleaned);
  const removed = changed.filter((r) => !r.cleaned); // 빈 문자열 된 경우
  const uniqChanged = new Set(changed.map((r) => `${r.original}→${r.cleaned}`));

  console.log(`전체: ${all.length}건`);
  console.log(`변경 대상: ${changed.length}건 (${((changed.length / all.length) * 100).toFixed(1)}%)`);
  console.log(`결과 공집합(위험): ${removed.length}건`);
  console.log(`고유 변경 패턴: ${uniqChanged.size}개\n`);

  // 변경 빈도 상위
  const patternFreq = new Map<string, number>();
  for (const r of changed) {
    const k = `${r.original} → ${r.cleaned || "(빈 문자열)"}`;
    patternFreq.set(k, (patternFreq.get(k) ?? 0) + 1);
  }
  const topPatterns = Array.from(patternFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25);

  console.log("=== 변경 패턴 상위 25 ===");
  for (const [pat, cnt] of topPatterns) {
    console.log(`  [${cnt}건]  ${pat}`);
  }

  if (removed.length > 0) {
    console.log("\n=== ⚠️ 공집합 된 케이스 (정리 스킵 대상) ===");
    for (const r of removed.slice(0, 10)) {
      console.log(`  ${r.id}  original="${r.original}"`);
    }
  }

  // 저장
  const out = join(tmpdir(), "winery-cleanup-preview.json");
  writeFileSync(out, JSON.stringify({
    total: all.length,
    changed: changed.length,
    removedToEmpty: removed.length,
    uniquePatterns: uniqChanged.size,
    samples: changed.slice(0, 200),
  }, null, 2));
  console.log(`\n📄 상세 저장: ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
