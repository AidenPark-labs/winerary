/**
 * term_dict 한글 표기를 프랑스식 발음으로 통일.
 *
 * 기존 ko 값은 aliases에 남겨 매칭은 유지.
 * 이후 wines.grape_varieties_ko 재계산은 별도 스크립트.
 *
 * 모드:
 *   --apply (기본 dry-run)
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const APPLY = process.argv.includes("--apply");

// (en, 새 한글명) 쌍. 기존 ko가 다르면 aliases에 자동 추가.
const UPDATES: Array<{ en: string; newKo: string; note?: string }> = [
  { en: "Aligoté", newKo: "알리고떼", note: "프랑스식 경음" },
  { en: "Gamay", newKo: "가메", note: "프랑스식 (가메이 X)" },
  { en: "Grenache", newKo: "그르나슈", note: "슬래시 제거. Garnacha는 별도 entry에서 관리" },
  { en: "Mourvèdre", newKo: "무르베드르", note: "슬래시 제거. Monastrell은 별도" },
  { en: "Muscat", newKo: "뮈스카", note: "프랑스식 (뮤스캣 X)" },
];

async function main() {
  console.log(`=== update-grape-ko-french-style ${APPLY ? "[APPLY]" : "[DRY-RUN]"} ===\n`);

  for (const u of UPDATES) {
    const { data, error } = await sb
      .from("term_dict")
      .select("ko, aliases")
      .eq("category", "grape")
      .eq("en", u.en)
      .single();
    if (error || !data) {
      console.error(`  [${u.en}] 조회 실패: ${error?.message ?? "not found"}`);
      continue;
    }
    const currentKo = data.ko as string;
    const currentAliases = Array.isArray(data.aliases) ? (data.aliases as string[]) : [];

    if (currentKo === u.newKo) {
      console.log(`  [${u.en}] 이미 "${currentKo}" — skip`);
      continue;
    }

    // 기존 ko를 aliases에 추가 (없으면)
    const newAliases = currentAliases.includes(currentKo) ? currentAliases : [...currentAliases, currentKo];

    console.log(`  [${u.en}] "${currentKo}" → "${u.newKo}"  (aliases +"${currentKo}")  — ${u.note ?? ""}`);

    if (APPLY) {
      const { error: upErr } = await sb
        .from("term_dict")
        .update({ ko: u.newKo, aliases: newAliases, updated_at: new Date().toISOString() })
        .eq("category", "grape")
        .eq("en", u.en);
      if (upErr) console.error(`    update err: ${upErr.message}`);
    }
  }

  if (!APPLY) console.log("\n※ DRY-RUN. 실행: --apply");
}

main().catch((e) => { console.error(e); process.exit(1); });
