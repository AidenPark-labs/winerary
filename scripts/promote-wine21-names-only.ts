/**
 * wine21 raw_wines → wines 일괄 promote (이름만)
 *
 * 목적:
 *   와인 DB 보강 전에 "이름만 풍부해도 검색이 잘 되는가"를 검증.
 *   wine21 33,722건을 wines 테이블로 promote하되,
 *   name_ko/en, producer만 채우고 나머지(wine_type, country 등)는 NULL.
 *
 * 정책:
 *   - data_source = 'wine21' (롤백 시 식별자)
 *   - is_published = true (검색 결과 노출)
 *   - producer = producer_ko (검색 호환)
 *   - 중복 (name_ko 충돌) 시 스킵 — legacy 데이터 보존
 *   - 배치 500건씩
 *
 * 롤백:
 *   DELETE FROM wines WHERE data_source = 'wine21';
 *
 * 실행:
 *   npx tsx scripts/promote-wine21-names-only.ts
 *   npx tsx scripts/promote-wine21-names-only.ts --dry-run
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ .env.local 환경변수 확인 필요");
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 500;
const PAGE_SIZE = 1000;

const H = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

interface RawWine {
  source_id: string;
  name_ko: string;
  name_en: string | null;
  producer_ko: string | null;
  producer_en: string | null;
}

// ─── raw_wines 페이지 로드 ─────────────────────────────────────────────────

async function fetchRawBatch(offset: number): Promise<RawWine[]> {
  const url =
    `${SUPABASE_URL}/rest/v1/raw_wines` +
    `?source=eq.wine21` +
    `&select=source_id,name_ko,name_en,producer_ko,producer_en` +
    `&order=source_id.asc` +
    `&limit=${PAGE_SIZE}` +
    `&offset=${offset}`;
  const res = await fetch(url, { headers: H });
  if (!res.ok) {
    throw new Error(`raw_wines 로드 실패 (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as RawWine[];
}

async function countRaw(): Promise<number> {
  const url = `${SUPABASE_URL}/rest/v1/raw_wines?source=eq.wine21&select=source_id`;
  const res = await fetch(url, {
    headers: { ...H, Prefer: "count=exact", Range: "0-0" },
  });
  const cr = res.headers.get("content-range") || "";
  const m = cr.match(/\/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

// ─── wines 중복 체크 (name_ko 일괄 조회) ────────────────────────────────────

async function fetchExistingNames(names: string[]): Promise<Set<string>> {
  // PostgREST의 in.() 필터에 큰 배열 넣기 (URL 길이 제한 회피 위해 청크 분할)
  const existing = new Set<string>();
  const CHUNK = 25;
  for (let i = 0; i < names.length; i += CHUNK) {
    const slice = names.slice(i, i + CHUNK);
    // PostgREST in: 콤마 구분, 값에 콤마/괄호 있으면 이슈 → URL 인코딩
    const inList = slice.map((n) => `"${n.replace(/"/g, '\\"')}"`).join(",");
    const url = `${SUPABASE_URL}/rest/v1/wines?select=name_ko&name_ko=in.(${encodeURIComponent(inList)})`;
    const res = await fetch(url, { headers: H });
    if (!res.ok) {
      console.error(`  ⚠ 중복 체크 실패 (${res.status}):`, (await res.text()).slice(0, 200));
      continue;
    }
    const rows = (await res.json()) as Array<{ name_ko: string }>;
    for (const r of rows) existing.add(r.name_ko);
  }
  return existing;
}

// ─── wines INSERT ─────────────────────────────────────────────────────────

async function insertBatch(rows: RawWine[]): Promise<{ inserted: number; failed: number }> {
  if (rows.length === 0) return { inserted: 0, failed: 0 };

  const payload = rows.map((r) => ({
    name_ko: r.name_ko,
    name_en: r.name_en || null,
    producer: r.producer_ko || null, // 검색 호환 (legacy 컬럼)
    producer_ko: r.producer_ko || null,
    producer_en: r.producer_en || null,
    data_source: "wine21",
  }));

  if (DRY_RUN) {
    return { inserted: payload.length, failed: 0 };
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/wines`, {
    method: "POST",
    headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    // ON CONFLICT 동작이 아니므로, 배치 내 일부가 충돌하면 전체 실패
    // → 배치를 1건씩 재시도
    if (res.status === 409 || text.includes("duplicate")) {
      let inserted = 0;
      let failed = 0;
      for (const p of payload) {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/wines`, {
          method: "POST",
          headers: { ...H, Prefer: "return=minimal" },
          body: JSON.stringify([p]),
        });
        if (r.ok) inserted++;
        else failed++;
      }
      return { inserted, failed };
    }
    console.error(`  ⚠ INSERT 실패 (${res.status}):`, text.slice(0, 300));
    return { inserted: 0, failed: payload.length };
  }
  return { inserted: payload.length, failed: 0 };
}

// ─── 메인 ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("🍷 wine21 → wines promote (이름만)");
  console.log(`   모드: ${DRY_RUN ? "DRY RUN (실제 INSERT 안 함)" : "REAL INSERT"}\n`);

  const total = await countRaw();
  console.log(`📊 raw_wines (source=wine21) 총 ${total.toLocaleString()}건\n`);

  let processed = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let offset = 0;

  while (offset < total) {
    const raw = await fetchRawBatch(offset);
    if (raw.length === 0) break;

    // 중복 체크
    const names = raw.map((r) => r.name_ko).filter(Boolean);
    const existing = await fetchExistingNames(names);

    const fresh = raw.filter((r) => !existing.has(r.name_ko));
    const skipped = raw.length - fresh.length;
    totalSkipped += skipped;

    // wine21 내부 중복 dedupe (같은 batch 안에서)
    const seen = new Set<string>();
    const unique: RawWine[] = [];
    for (const r of fresh) {
      if (seen.has(r.name_ko)) {
        totalSkipped++;
        continue;
      }
      seen.add(r.name_ko);
      unique.push(r);
    }

    // 배치 INSERT (BATCH_SIZE 단위)
    for (let i = 0; i < unique.length; i += BATCH_SIZE) {
      const slice = unique.slice(i, i + BATCH_SIZE);
      const { inserted, failed } = await insertBatch(slice);
      totalInserted += inserted;
      totalFailed += failed;
    }

    processed += raw.length;
    offset += raw.length;

    const pct = ((processed / total) * 100).toFixed(1);
    process.stdout.write(
      `\r⏳ ${processed.toLocaleString()}/${total.toLocaleString()} (${pct}%)  ` +
        `inserted=${totalInserted.toLocaleString()}  skipped=${totalSkipped.toLocaleString()}  failed=${totalFailed}`
    );
  }

  console.log("\n\n━━━ 완료 ━━━");
  console.log(`총 처리:   ${processed.toLocaleString()}`);
  console.log(`✅ 삽입:   ${totalInserted.toLocaleString()}`);
  console.log(`⏭  스킵:   ${totalSkipped.toLocaleString()} (이미 존재)`);
  console.log(`❌ 실패:   ${totalFailed.toLocaleString()}`);

  if (DRY_RUN) {
    console.log("\n⚠ DRY RUN 모드. 실제 INSERT 안 됨.");
    console.log("   실제 실행: npx tsx scripts/promote-wine21-names-only.ts");
  } else {
    console.log("\n🔄 롤백 명령:");
    console.log("   DELETE FROM wines WHERE data_source = 'wine21';");
  }
}

main().catch((e) => {
  console.error("\n❌ 에러:", e);
  process.exit(1);
});
