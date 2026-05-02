// wines_v2의 UNIQUE 제약 (name_ko, vivino_url) 충돌 검증
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function fetchAll(col: string): Promise<any[]> {
  const out: any[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb
      .from("wines")
      .select(col)
      .not(col, "is", null)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += data.length;
  }
  return out;
}

async function main() {
  // name_ko 중복
  const rows = await fetchAll("name_ko");
  const nameCount = new Map<string, number>();
  for (const r of rows ?? []) {
    const n = (r.name_ko as string).trim();
    nameCount.set(n, (nameCount.get(n) ?? 0) + 1);
  }
  const dupNames = [...nameCount.entries()].filter(([, v]) => v > 1);
  console.log(`name_ko 중복: ${dupNames.length}개 그룹`);
  if (dupNames.length > 0) {
    console.log("  샘플 (≤10):");
    for (const [n, c] of dupNames.slice(0, 10)) console.log(`    "${n}" × ${c}`);
  }

  // vivino_url 중복
  const vrows = await fetchAll("vivino_url");
  const urlCount = new Map<string, number>();
  for (const r of vrows ?? []) {
    const u = (r.vivino_url as string).trim();
    urlCount.set(u, (urlCount.get(u) ?? 0) + 1);
  }
  const dupUrls = [...urlCount.entries()].filter(([, v]) => v > 1);
  console.log(`\nvivino_url 중복: ${dupUrls.length}개 그룹`);
  if (dupUrls.length > 0) {
    console.log("  샘플 (≤10):");
    for (const [u, c] of dupUrls.slice(0, 10)) console.log(`    "${u}" × ${c}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
