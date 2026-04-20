/**
 * term_dict.aliases에 품종 변형 표기 추가
 *
 * 대상:
 *   Cabernet Sauvignon: "까베르네 쇼비뇽", "카버네 소비뇽", "카베르네 쇼비뇽"
 *   Riesling:           "리즐링"
 *
 * 멱등: 이미 있는 alias는 skip.
 *
 * 실행:
 *   NODE_ENV=development npx tsx scripts/add-grape-aliases.ts --dry-run
 *   NODE_ENV=development npx tsx scripts/add-grape-aliases.ts
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const DRY_RUN = process.argv.includes("--dry-run");

const ADDITIONS: Array<{ en: string; newAliases: string[] }> = [
  { en: "Cabernet Sauvignon", newAliases: ["까베르네 쇼비뇽", "카버네 소비뇽", "카베르네 쇼비뇽"] },
  { en: "Riesling", newAliases: ["리즐링"] },
];

async function main() {
  console.log(`${DRY_RUN ? "[DRY-RUN]" : "[EXEC]"} term_dict.aliases 품종 변형 추가\n`);

  for (const a of ADDITIONS) {
    const { data: row, error: selErr } = await sb
      .from("term_dict")
      .select("en, ko, aliases")
      .eq("category", "grape")
      .eq("en", a.en)
      .maybeSingle();
    if (selErr) { console.error(`❌ ${a.en} 조회 실패: ${selErr.message}`); continue; }
    if (!row) { console.log(`⏭ ${a.en}: term_dict에 없음 — skip`); continue; }

    const currentAliases = (Array.isArray(row.aliases) ? row.aliases : []) as string[];
    const lowered = new Set(currentAliases.map((x) => x.toLowerCase()));
    const toAdd = a.newAliases.filter((v) => !lowered.has(v.toLowerCase()));

    console.log(`【${a.en}】 ko="${row.ko}"`);
    console.log(`  기존 aliases 수: ${currentAliases.length}`);
    if (toAdd.length === 0) {
      console.log(`  ✓ 추가할 항목 없음 (이미 모두 존재)\n`);
      continue;
    }
    console.log(`  추가 예정: [${toAdd.join(", ")}]`);

    if (DRY_RUN) { console.log(""); continue; }

    const newAliases = [...currentAliases, ...toAdd];
    const { error: updErr } = await sb
      .from("term_dict")
      .update({ aliases: newAliases })
      .eq("category", "grape")
      .eq("en", a.en);
    if (updErr) console.error(`  ❌ UPDATE 실패: ${updErr.message}`);
    else console.log(`  ✅ 추가 완료 (총 ${newAliases.length}개 aliases)\n`);
  }

  console.log(`\n${DRY_RUN ? "[DRY-RUN 완료]" : "✅ 실행 완료"}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
