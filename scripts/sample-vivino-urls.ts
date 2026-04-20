/**
 * raw_wines의 vivino_url 샘플 조사 (READ-ONLY)
 *
 * 실행: NODE_ENV=development npx tsx scripts/sample-vivino-urls.ts
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  console.log("═══ raw_wines.raw_payload.vivino_url 샘플 ═══\n");

  // vivino_url 있는 raw_wines에서 30건
  const { data, error } = await sb
    .from("raw_wines")
    .select("id, name_ko, name_en, source, raw_payload")
    .eq("source", "wine21")
    .not("raw_payload->>vivino_url", "is", null)
    .limit(30);
  if (error) throw error;

  // URL 패턴 분류
  const patterns: Record<string, number> = {};

  console.log("샘플 20건:\n");
  for (const r of (data ?? []).slice(0, 20)) {
    const payload = r.raw_payload as Record<string, unknown>;
    const url = payload.vivino_url as string;
    const pageUrl = payload.vivino_page_url as string | undefined;
    const name = payload.vivino_name as string | undefined;
    console.log(`[${r.name_ko}] / ${r.name_en}`);
    console.log(`  vivino_url:      ${url}`);
    console.log(`  vivino_page_url: ${pageUrl ?? "(없음)"}`);
    console.log(`  vivino_name:     ${name ?? "(없음)"}`);
    console.log();

    // URL 호스트/경로 패턴 추출
    try {
      const u = new URL(url);
      const key = u.pathname.split("/").slice(0, 3).join("/");
      patterns[`${u.host}${key}`] = (patterns[`${u.host}${key}`] ?? 0) + 1;
    } catch {
      patterns["(invalid URL)"] = (patterns["(invalid URL)"] ?? 0) + 1;
    }
  }

  // 전체 14,931건의 URL 패턴 분포
  console.log("═══ URL 패턴 분포 (전체 14,931건 중 샘플 1,000) ═══");
  const { data: all } = await sb
    .from("raw_wines")
    .select("raw_payload")
    .eq("source", "wine21")
    .not("raw_payload->>vivino_url", "is", null)
    .limit(1000);

  const allPatterns: Record<string, number> = {};
  for (const r of all ?? []) {
    const payload = r.raw_payload as Record<string, unknown>;
    const url = payload.vivino_url as string;
    try {
      const u = new URL(url);
      // 경로 앞 2단계만 보고 분류
      const parts = u.pathname.split("/").filter((p) => p);
      const pattern = parts.length > 0 ? `/${parts[0]}` : "/";
      allPatterns[`${u.host}${pattern}`] = (allPatterns[`${u.host}${pattern}`] ?? 0) + 1;
    } catch {
      allPatterns["(invalid URL)"] = (allPatterns["(invalid URL)"] ?? 0) + 1;
    }
  }
  for (const [p, c] of Object.entries(allPatterns).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${p.padEnd(50)} ${c}`);
  }

  // raw_payload의 모든 vivino_* 키도 나열
  console.log("\n═══ raw_payload 중 vivino_* 키 목록 (첫 행 기준) ═══");
  const firstPayload = (data?.[0]?.raw_payload as Record<string, unknown>) ?? {};
  const vivinoKeys = Object.keys(firstPayload).filter((k) => k.startsWith("vivino"));
  for (const k of vivinoKeys) {
    const val = firstPayload[k];
    const preview = typeof val === "string" ? val.slice(0, 100) : JSON.stringify(val).slice(0, 100);
    console.log(`  ${k}: ${preview}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
