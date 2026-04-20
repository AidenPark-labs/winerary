/**
 * Phase 0: DB 전체 JSON 백업 (v3 재설계 안전장치)
 *
 * 실행: NODE_ENV=development npx tsx scripts/backup-v3-phase0.ts
 *
 * 백업 위치: backup/v3-phase0-YYYY-MM-DD-HHmm/
 * 대상 테이블:
 *   - wines (큰 테이블, 10k 단위 분할)
 *   - raw_wines (큰 테이블, 10k 단위 분할)
 *   - wine_records (deleted 포함 전체)
 *   - pending_wines
 *   - record_evaluations (있으면)
 *   - wine_wishlist
 *   - profiles (사용자 매핑 보존)
 *
 * 각 테이블은 JSON Lines 형식으로 저장 (메모리 효율 + 재복원 용이)
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PAGE = 1000;
const SPLIT_THRESHOLD = 10000; // 10k 이상은 파일 분할

function timestampSuffix(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

const BACKUP_ROOT = path.join(process.cwd(), "backup", `v3-phase0-${timestampSuffix()}`);

async function backupTable(table: string): Promise<{ table: string; count: number; files: string[]; error?: string }> {
  console.log(`\n[${table}] 백업 시작...`);

  // 건수 확인
  const { count, error: countErr } = await sb.from(table).select("*", { count: "exact", head: true });
  if (countErr) {
    console.log(`  ⚠️ count 실패: ${JSON.stringify(countErr)}`);
    return { table, count: 0, files: [], error: JSON.stringify(countErr) };
  }

  const total = count ?? 0;
  console.log(`  전체 ${total.toLocaleString()}건`);

  if (total === 0) {
    // 빈 파일 생성
    const filePath = path.join(BACKUP_ROOT, `${table}.jsonl`);
    fs.writeFileSync(filePath, "");
    return { table, count: 0, files: [filePath] };
  }

  const files: string[] = [];
  let offset = 0;
  let partIndex = 0;
  let currentFile: string | null = null;
  let currentStream: fs.WriteStream | null = null;
  let rowsInCurrentFile = 0;

  while (offset < total) {
    // 새 파일 필요?
    if (currentStream === null || rowsInCurrentFile >= SPLIT_THRESHOLD) {
      if (currentStream) {
        await new Promise<void>((res) => currentStream!.end(() => res()));
      }
      const suffix = total > SPLIT_THRESHOLD ? `.part${String(partIndex).padStart(3, "0")}` : "";
      currentFile = path.join(BACKUP_ROOT, `${table}${suffix}.jsonl`);
      currentStream = fs.createWriteStream(currentFile, { flags: "w", encoding: "utf-8" });
      files.push(currentFile);
      rowsInCurrentFile = 0;
      partIndex++;
    }

    const { data, error } = await sb.from(table).select("*").range(offset, offset + PAGE - 1);
    if (error) {
      console.log(`  ⚠️ range ${offset} 실패: ${JSON.stringify(error)}`);
      return { table, count: offset, files, error: JSON.stringify(error) };
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      currentStream!.write(JSON.stringify(row) + "\n");
      rowsInCurrentFile++;
    }

    offset += data.length;
    process.stdout.write(`\r  진행: ${offset.toLocaleString()} / ${total.toLocaleString()}  `);

    if (data.length < PAGE) break;
  }

  if (currentStream) {
    await new Promise<void>((res) => currentStream!.end(() => res()));
  }
  process.stdout.write("\n");

  console.log(`  완료: ${offset.toLocaleString()}건 → ${files.length}개 파일`);
  return { table, count: offset, files };
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  Phase 0: DB 전체 JSON 백업");
  console.log("═══════════════════════════════════════════════════");
  console.log(`백업 경로: ${BACKUP_ROOT}\n`);

  fs.mkdirSync(BACKUP_ROOT, { recursive: true });

  const tables = [
    "wines",
    "raw_wines",
    "wine_records",
    "pending_wines",
    "record_evaluations",
    "wine_wishlist",
    "profiles",
  ];

  const results = [];
  for (const t of tables) {
    const r = await backupTable(t);
    results.push(r);
  }

  // 요약 메타파일
  const summary = {
    timestamp: new Date().toISOString(),
    backup_dir: BACKUP_ROOT,
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    tables: results.map((r) => ({
      table: r.table,
      count: r.count,
      files: r.files.map((f) => path.relative(BACKUP_ROOT, f)),
      error: r.error,
    })),
  };
  fs.writeFileSync(path.join(BACKUP_ROOT, "_summary.json"), JSON.stringify(summary, null, 2));

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  백업 완료");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  디렉토리: ${BACKUP_ROOT}`);
  for (const r of results) {
    const status = r.error ? "❌" : "✅";
    console.log(`  ${status} ${r.table.padEnd(22)} ${r.count.toLocaleString().padStart(8)} 건  (${r.files.length} 파일)`);
  }

  // 디스크 사용량
  let totalBytes = 0;
  for (const r of results) {
    for (const f of r.files) {
      if (fs.existsSync(f)) totalBytes += fs.statSync(f).size;
    }
  }
  console.log(`\n  총 크기: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);

  // 복원 안내
  console.log(`\n📌 복원 시 참고: 각 *.jsonl 파일은 한 줄에 한 row. node 스크립트로 읽어서 supabase upsert로 복원 가능.`);
  console.log(`📌 _summary.json에 메타 정보 저장됨.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
