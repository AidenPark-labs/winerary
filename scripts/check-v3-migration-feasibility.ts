/**
 * v3 마이그레이션 현실성 체크 (READ-ONLY)
 *
 * baseline 결과 바탕으로 아래를 확인:
 *   A. wine21 name_ko 매칭 시뮬레이션 (raw_wines ↔ wines 연결 백필 가능성)
 *   B. wine_records FK XOR 위반 건 식별
 *   C. gangnam raw_wines 필드 온전성 (promote 포함 가능 여부)
 *   D. legacy(naver/winenara/user_submission) wines 필드 온전성 (역이관 대상)
 *
 * ※ 어떤 쓰기도 하지 않음.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PAGE = 1000;

async function fetchAll<T>(
  table: string,
  selector: string,
  filter?: (q: ReturnType<typeof sb.from>) => ReturnType<typeof sb.from>,
): Promise<T[]> {
  const result: T[] = [];
  let offset = 0;
  while (true) {
    let q = sb.from(table).select(selector).range(offset, offset + PAGE - 1);
    if (filter) q = filter(q as never) as never;
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${JSON.stringify(error)}`);
    if (!data || data.length === 0) break;
    result.push(...(data as T[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return result;
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  v3 마이그레이션 현실성 체크");
  console.log("═══════════════════════════════════════════════════\n");

  // ─── A. wine21 name_ko 매칭 시뮬레이션 ───
  console.log("【A. wine21 name_ko 매칭 시뮬레이션】");
  console.log("  raw_wines (wine21)의 name_ko로 wines (wine21)를 정확 매칭 가능한지");

  type RawW = { id: string; name_ko: string | null; name_en: string | null };
  type WineW = { id: string; name_ko: string; name_en: string | null };

  console.log("  wines (wine21) 로드 중...");
  const winesWine21: WineW[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from("wines")
      .select("id, name_ko, name_en")
      .eq("data_source", "wine21")
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    winesWine21.push(...(data as WineW[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  console.log(`  wines(wine21) 로드: ${winesWine21.length.toLocaleString()}`);

  console.log("  raw_wines (wine21) 로드 중...");
  const rawWine21: RawW[] = [];
  offset = 0;
  while (true) {
    const { data, error } = await sb
      .from("raw_wines")
      .select("id, name_ko, name_en")
      .eq("source", "wine21")
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rawWine21.push(...(data as RawW[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  console.log(`  raw_wines(wine21) 로드: ${rawWine21.length.toLocaleString()}`);

  // 매칭 키 후보: name_ko 정확 일치
  const winesByNameKo = new Map<string, WineW[]>();
  for (const w of winesWine21) {
    const key = w.name_ko?.trim() ?? "";
    if (!key) continue;
    if (!winesByNameKo.has(key)) winesByNameKo.set(key, []);
    winesByNameKo.get(key)!.push(w);
  }

  let matched = 0;
  let ambiguous = 0; // 같은 name_ko 여러 wines에 매칭
  let unmatched = 0;
  const ambiguousNames: string[] = [];
  for (const r of rawWine21) {
    const key = r.name_ko?.trim() ?? "";
    if (!key) {
      unmatched++;
      continue;
    }
    const cands = winesByNameKo.get(key);
    if (!cands) {
      unmatched++;
    } else if (cands.length === 1) {
      matched++;
    } else {
      ambiguous++;
      if (ambiguousNames.length < 10) ambiguousNames.push(key);
    }
  }
  console.log(`\n  정확 1:1 매칭:     ${matched.toLocaleString()} (${pct(matched, rawWine21.length)})`);
  console.log(`  중복 매칭 (1:N):    ${ambiguous.toLocaleString()} (${pct(ambiguous, rawWine21.length)}) — 수작업 필요`);
  console.log(`  매칭 실패:          ${unmatched.toLocaleString()} (${pct(unmatched, rawWine21.length)}) — raw_wines에만 존재`);

  // wines에만 있고 raw_wines에 대응 없는 것도 체크
  const rawNameKoSet = new Set(rawWine21.map((r) => r.name_ko?.trim()).filter(Boolean));
  let winesOrphan = 0;
  for (const w of winesWine21) {
    if (!rawNameKoSet.has(w.name_ko?.trim() ?? "")) winesOrphan++;
  }
  console.log(`  wines에만 존재:     ${winesOrphan.toLocaleString()} — raw_wines에 역이관 필요`);

  if (ambiguousNames.length > 0) {
    console.log(`\n  중복 매칭 샘플 (${Math.min(10, ambiguousNames.length)}건):`);
    for (const n of ambiguousNames) console.log(`    - ${n}`);
  }

  // ─── B. wine_records FK XOR 위반 ───
  console.log("\n【B. wine_records FK XOR 위반 건 식별】");
  const { data: xorViolators, error: xorErr } = await sb
    .from("wine_records")
    .select("id, user_id, wine_id, pending_wine_id, deleted_at")
    .not("wine_id", "is", null)
    .not("pending_wine_id", "is", null)
    .is("deleted_at", null);
  if (xorErr) throw xorErr;
  console.log(`  wine_id AND pending_wine_id 둘 다 NOT NULL: ${(xorViolators ?? []).length}건`);
  for (const v of (xorViolators ?? []).slice(0, 10)) {
    console.log(`    id=${v.id.slice(0, 8)}... user=${v.user_id.slice(0, 8)}... wine=${v.wine_id?.slice(0, 8)}... pending=${v.pending_wine_id?.slice(0, 8)}...`);
  }

  // ─── C. gangnam raw_wines 필드 온전성 ───
  console.log("\n【C. gangnam raw_wines 필드 온전성】 (Phase 3 promote 포함 여부 판단)");
  const { count: gangnamTotal } = await sb
    .from("raw_wines")
    .select("*", { count: "exact", head: true })
    .eq("source", "gangnam");
  const { count: gangnamName } = await sb
    .from("raw_wines")
    .select("*", { count: "exact", head: true })
    .eq("source", "gangnam")
    .not("name_ko", "is", null);
  const { count: gangnamVivino } = await sb
    .from("raw_wines")
    .select("*", { count: "exact", head: true })
    .eq("source", "gangnam")
    .not("vivino_url", "is", null);
  const { count: gangnamLlm } = await sb
    .from("raw_wines")
    .select("*", { count: "exact", head: true })
    .eq("source", "gangnam")
    .not("raw_payload->>llm_parsed_at", "is", null);
  const { count: gangnamType } = await sb
    .from("raw_wines")
    .select("*", { count: "exact", head: true })
    .eq("source", "gangnam")
    .not("wine_type", "is", null);
  const { count: gangnamGrape } = await sb
    .from("raw_wines")
    .select("*", { count: "exact", head: true })
    .eq("source", "gangnam")
    .not("grape_variety", "is", null);
  const { count: gangnamCountry } = await sb
    .from("raw_wines")
    .select("*", { count: "exact", head: true })
    .eq("source", "gangnam")
    .not("country", "is", null);
  console.log(`  gangnam 전체:          ${(gangnamTotal ?? 0).toLocaleString()}`);
  console.log(`  ├ name_ko 보유:         ${(gangnamName ?? 0).toLocaleString()} (${pct(gangnamName ?? 0, gangnamTotal ?? 1)})`);
  console.log(`  ├ wine_type 보유:       ${(gangnamType ?? 0).toLocaleString()} (${pct(gangnamType ?? 0, gangnamTotal ?? 1)})`);
  console.log(`  ├ country 보유:         ${(gangnamCountry ?? 0).toLocaleString()} (${pct(gangnamCountry ?? 0, gangnamTotal ?? 1)})`);
  console.log(`  ├ grape_variety 보유:   ${(gangnamGrape ?? 0).toLocaleString()} (${pct(gangnamGrape ?? 0, gangnamTotal ?? 1)})`);
  console.log(`  ├ vivino_url 매칭:      ${(gangnamVivino ?? 0).toLocaleString()} (${pct(gangnamVivino ?? 0, gangnamTotal ?? 1)})`);
  console.log(`  └ LLM 파싱 완료:        ${(gangnamLlm ?? 0).toLocaleString()} (${pct(gangnamLlm ?? 0, gangnamTotal ?? 1)})`);

  // ─── D. legacy wines (naver/winenara/user_submission) 필드 온전성 ───
  console.log("\n【D. legacy wines 필드 온전성】 (역이관 대상)");
  for (const src of ["naver_shopping", "winenara", "user_submission"]) {
    const { count: total } = await sb
      .from("wines")
      .select("*", { count: "exact", head: true })
      .eq("data_source", src);
    const { count: withName } = await sb
      .from("wines")
      .select("*", { count: "exact", head: true })
      .eq("data_source", src)
      .not("name_ko", "is", null);
    const { count: withType } = await sb
      .from("wines")
      .select("*", { count: "exact", head: true })
      .eq("data_source", src)
      .not("wine_type", "is", null);
    const { count: withCountry } = await sb
      .from("wines")
      .select("*", { count: "exact", head: true })
      .eq("data_source", src)
      .not("country", "is", null);
    const { count: withVivino } = await sb
      .from("wines")
      .select("*", { count: "exact", head: true })
      .eq("data_source", src)
      .not("vivino_url", "is", null);
    console.log(`  ${src}:`);
    console.log(`    전체:               ${(total ?? 0).toLocaleString()}`);
    console.log(`    ├ name_ko 보유:     ${(withName ?? 0).toLocaleString()} (${pct(withName ?? 0, total ?? 1)})`);
    console.log(`    ├ wine_type 보유:   ${(withType ?? 0).toLocaleString()} (${pct(withType ?? 0, total ?? 1)})`);
    console.log(`    ├ country 보유:     ${(withCountry ?? 0).toLocaleString()} (${pct(withCountry ?? 0, total ?? 1)})`);
    console.log(`    └ vivino_url 보유:  ${(withVivino ?? 0).toLocaleString()} (${pct(withVivino ?? 0, total ?? 1)})`);
  }

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  현실성 체크 완료");
  console.log("═══════════════════════════════════════════════════");
}

function pct(n: number, total: number): string {
  if (total === 0) return "0.0%";
  return `${((n / total) * 100).toFixed(1)}%`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
