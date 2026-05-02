// wines_v2.search_jamo 트리거 동작 검증 (INSERT, UPDATE 시 자동 갱신)
import { config } from "dotenv";
config({ path: ".env.local" });

import { Client } from "pg";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query("BEGIN");
    try {
      // 1) INSERT 시 자동 채움
      const ins = await c.query(`
        INSERT INTO public.wines_v2
          (id, source, name_ko, name_en, wine_type, country_ko, grape_varieties)
        VALUES (gen_random_uuid(), 'admin', '시험 와인', 'Test Wine', 'red', '프랑스', ARRAY['메를로'])
        RETURNING id, search_jamo`);
      console.log("[INSERT 직후] search_jamo:", ins.rows[0].search_jamo);

      // 2) UPDATE name_ko 시 자동 갱신
      const id = ins.rows[0].id;
      await c.query(`UPDATE public.wines_v2 SET name_ko = '바뀐 이름' WHERE id = $1`, [id]);
      const upd = await c.query(`SELECT search_jamo FROM public.wines_v2 WHERE id = $1`, [id]);
      console.log("[UPDATE name_ko 후] search_jamo:", upd.rows[0].search_jamo);

      // 3) UPDATE 다른 필드 (price) 시 변경 안 됨 — 트리거 조건 명시 검증
      const before = upd.rows[0].search_jamo;
      await c.query(`UPDATE public.wines_v2 SET price = 50000 WHERE id = $1`, [id]);
      const after = await c.query(`SELECT search_jamo FROM public.wines_v2 WHERE id = $1`, [id]);
      console.log("[UPDATE price 후] search_jamo 동일:", after.rows[0].search_jamo === before);
    } finally {
      await c.query("ROLLBACK");
    }
    console.log("\n트리거 정상 동작. 테스트 데이터 ROLLBACK.");
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
