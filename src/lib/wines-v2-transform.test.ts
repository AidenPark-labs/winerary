/**
 * wines-v2-transform 단위 테스트
 *
 * 실행:
 *   NODE_ENV=development npx tsx src/lib/wines-v2-transform.test.ts
 *
 * 외부 의존성 없음. mock TermDictLookup 사용. supabase client 호출 안 함.
 */
import { strict as assert } from "node:assert";

import {
  normalizeWineTypeEnum,
  parseAlcoholNumeric,
  buildSourceSnapshot,
  extractGrapePercent,
  translateGrapesToKo,
  translateRegionToKo,
  translateProducer,
  transformInput,
  buildUpdatePatch,
  type TermDictLookup,
  type TermDictEntry,
  type WinesV2Input,
  type WinesV2Row,
} from "./wines-v2-transform";

// ============================================================================
// 테스트 헬퍼
// ============================================================================

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(label: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      passed++;
      console.log(`  ✓ ${label}`);
    })
    .catch((e) => {
      failed++;
      failures.push(`${label}: ${e?.message ?? e}`);
      console.error(`  ✗ ${label}`);
      console.error(`     ${e?.message ?? e}`);
    });
}

function group(name: string, fn: () => Promise<void> | void): Promise<void> {
  console.log(`\n[${name}]`);
  return Promise.resolve(fn());
}

// ============================================================================
// Mock TermDict — 테스트용 사전
// ============================================================================

const MOCK_DICT_ENTRIES: TermDictEntry[] = [
  // grape
  { category: "grape", en: "Cabernet Sauvignon", ko: "까베르네 소비뇽", aliases: ["Cab Sauv", "CS"] },
  { category: "grape", en: "Merlot", ko: "메를로", aliases: [] },
  { category: "grape", en: "Chardonnay", ko: "샤르도네", aliases: [] },
  { category: "grape", en: "Petit Verdot", ko: "쁘띠 베르도", aliases: [] },
  // country
  { category: "country", en: "France", ko: "프랑스", aliases: [] },
  { category: "country", en: "Italy", ko: "이탈리아", aliases: [] },
  { category: "country", en: "United States", ko: "미국", aliases: ["USA", "US"] },
  // region
  { category: "region", en: "Bordeaux", ko: "보르도", aliases: [] },
  { category: "region", en: "Médoc", ko: "메독", aliases: ["Medoc"] },
  { category: "region", en: "Tuscany", ko: "토스카나", aliases: ["Toscana"] },
  { category: "region", en: "Napa Valley", ko: "나파 밸리", aliases: [] },
  // winery
  { category: "winery", en: "Château Margaux", ko: "샤또 마고", aliases: ["Chateau Margaux", "샤또마고"] },
];

function makeMockDict(): TermDictLookup {
  // normKey 사용 (모듈과 동일)
  const normKey = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "")
      .trim();

  const map = new Map<string, TermDictEntry>();
  for (const e of MOCK_DICT_ENTRIES) {
    for (const k of [e.en, e.ko, ...e.aliases]) {
      const nk = normKey(k);
      if (nk) map.set(`${e.category}::${nk}`, e);
    }
  }
  return {
    match(category, value) {
      if (!value) return null;
      const nk = normKey(value);
      return nk ? map.get(`${category}::${nk}`) ?? null : null;
    },
  };
}

// ============================================================================
// 테스트
// ============================================================================

async function main() {
  const dict = makeMockDict();
  // 테스트에서 supabase는 실제 호출되지 않음 (dict 인자 전달 시)
  const fakeSb = {} as any;

  await group("normalizeWineTypeEnum", async () => {
    await test("null → other", () => assert.equal(normalizeWineTypeEnum(null), "other"));
    await test("빈 문자열 → other", () => assert.equal(normalizeWineTypeEnum(""), "other"));
    await test("'red' → red", () => assert.equal(normalizeWineTypeEnum("red"), "red"));
    await test("'RED' → red (case)", () => assert.equal(normalizeWineTypeEnum("RED"), "red"));
    await test("'rosé' → rose (변형)", () => assert.equal(normalizeWineTypeEnum("rosé"), "rose"));
    await test("'sparkling wine' → sparkling", () =>
      assert.equal(normalizeWineTypeEnum("sparkling wine"), "sparkling"));
    await test("'unknown' → other", () => assert.equal(normalizeWineTypeEnum("unknown"), "other"));
    await test("공백 trim", () => assert.equal(normalizeWineTypeEnum("  white  "), "white"));
  });

  await group("parseAlcoholNumeric", async () => {
    await test("null → null", () => assert.equal(parseAlcoholNumeric(null), null));
    await test("'13.5%' → 13.5", () => assert.equal(parseAlcoholNumeric("13.5%"), 13.5));
    await test("'13,5' → 13.5 (콤마)", () => assert.equal(parseAlcoholNumeric("13,5"), 13.5));
    await test("'13.5도' → 13.5", () => assert.equal(parseAlcoholNumeric("13.5도"), 13.5));
    await test("'13' → 13", () => assert.equal(parseAlcoholNumeric("13"), 13));
    await test("13.5 (number) → 13.5", () => assert.equal(parseAlcoholNumeric(13.5), 13.5));
    await test("'abc' → null", () => assert.equal(parseAlcoholNumeric("abc"), null));
    await test("-5 → null (음수)", () => assert.equal(parseAlcoholNumeric(-5), null));
    await test("35 → null (>30)", () => assert.equal(parseAlcoholNumeric(35), null));
    await test("'13.5 % vol' → 13.5", () => assert.equal(parseAlcoholNumeric("13.5 % vol"), 13.5));
  });

  await group("extractGrapePercent", async () => {
    await test("이름만 → percent null", () =>
      assert.deepEqual(extractGrapePercent("Cabernet Sauvignon"), {
        name: "Cabernet Sauvignon",
        percent: null,
      }));
    await test("뒤 비율: 'Cabernet Sauvignon 60%'", () =>
      assert.deepEqual(extractGrapePercent("Cabernet Sauvignon 60%"), {
        name: "Cabernet Sauvignon",
        percent: 60,
      }));
    await test("앞 비율: '60% Cabernet Sauvignon'", () =>
      assert.deepEqual(extractGrapePercent("60% Cabernet Sauvignon"), {
        name: "Cabernet Sauvignon",
        percent: 60,
      }));
    await test("괄호 비율: 'Cabernet Sauvignon (60%)'", () =>
      assert.deepEqual(extractGrapePercent("Cabernet Sauvignon (60%)"), {
        name: "Cabernet Sauvignon",
        percent: 60,
      }));
    await test("소수 비율: 'Cabernet Sauvignon 60.5%'", () =>
      assert.deepEqual(extractGrapePercent("Cabernet Sauvignon 60.5%"), {
        name: "Cabernet Sauvignon",
        percent: 60.5,
      }));
    await test("범위 밖: 'Cabernet 150%' → 비율 null", () =>
      assert.deepEqual(extractGrapePercent("Cabernet 150%"), {
        name: "Cabernet",
        percent: null,
      }));
    await test("괄호 노트 제거: 'Cabernet Sauvignon (blend)'", () =>
      assert.deepEqual(extractGrapePercent("Cabernet Sauvignon (blend)"), {
        name: "Cabernet Sauvignon",
        percent: null,
      }));
  });

  await group("translateGrapesToKo", async () => {
    await test("빈 배열 → 빈 결과", () => {
      const r = translateGrapesToKo([], dict);
      assert.deepEqual(r, { ko: [], unknowns: [], blend: [] });
    });
    await test("영문 매칭", () => {
      const r = translateGrapesToKo(["Cabernet Sauvignon", "Merlot"], dict);
      assert.deepEqual(r.ko, ["까베르네 소비뇽", "메를로"]);
      assert.deepEqual(r.unknowns, []);
    });
    await test("한글 그대로 통과 (사전 매칭 X)", () => {
      const r = translateGrapesToKo(["희귀한품종"], dict);
      assert.deepEqual(r.ko, ["희귀한품종"]);
      assert.deepEqual(r.unknowns, []);
    });
    await test("영문 미커버 → unknowns", () => {
      const r = translateGrapesToKo(["Mtsvane"], dict);
      assert.deepEqual(r.ko, []);
      assert.deepEqual(r.unknowns, ["Mtsvane"]);
    });
    await test("dedup (영·한 같은 grape)", () => {
      const r = translateGrapesToKo(["Cab Sauv", "까베르네 소비뇽"], dict);
      assert.deepEqual(r.ko, ["까베르네 소비뇽"]);
    });
    await test("비율 분리", () => {
      const r = translateGrapesToKo(["Cabernet Sauvignon 60%", "Merlot 40%"], dict);
      assert.deepEqual(r.ko, ["까베르네 소비뇽", "메를로"]);
      assert.deepEqual(r.blend, [
        { grape: "까베르네 소비뇽", percent: 60 },
        { grape: "메를로", percent: 40 },
      ]);
    });
    await test("괄호 노트 제거", () => {
      const r = translateGrapesToKo(["Cabernet Sauvignon (blend)"], dict);
      assert.deepEqual(r.ko, ["까베르네 소비뇽"]);
    });
    await test("빈 항목 무시", () => {
      const r = translateGrapesToKo(["", "Merlot", null, undefined], dict);
      assert.deepEqual(r.ko, ["메를로"]);
    });
  });

  await group("translateRegionToKo (country)", async () => {
    await test("null → null + unknown=false", () =>
      assert.deepEqual(translateRegionToKo("country", null, dict), { ko: null, unknown: false }));
    await test("영문 매칭: 'France' → 프랑스", () =>
      assert.deepEqual(translateRegionToKo("country", "France", dict), {
        ko: "프랑스",
        unknown: false,
      }));
    await test("alias 매칭: 'USA' → 미국", () =>
      assert.deepEqual(translateRegionToKo("country", "USA", dict), {
        ko: "미국",
        unknown: false,
      }));
    await test("한글 그대로", () =>
      assert.deepEqual(translateRegionToKo("country", "프랑스", dict), {
        ko: "프랑스",
        unknown: false,
      }));
    await test("영문 미커버 → 그대로 통과 + unknown=true", () =>
      assert.deepEqual(translateRegionToKo("country", "Atlantis", dict), {
        ko: "Atlantis",
        unknown: true,
      }));
    await test("한글 미커버 → 그대로 통과", () =>
      assert.deepEqual(translateRegionToKo("country", "알수없는나라", dict), {
        ko: "알수없는나라",
        unknown: false,
      }));
  });

  await group("translateRegionToKo (region)", async () => {
    await test("path finest 매칭: 'France / Bordeaux / Médoc' → 메독", () =>
      assert.deepEqual(translateRegionToKo("region", "France / Bordeaux / Médoc", dict), {
        ko: "메독",
        unknown: false,
      }));
    await test("path fallback up: 'France / Bordeaux / 1er Cru' → 보르도", () =>
      assert.deepEqual(translateRegionToKo("region", "France / Bordeaux / 1er Cru", dict), {
        ko: "보르도",
        unknown: false,
      }));
    await test(">구분자: 'Italy > Tuscany' → 토스카나", () =>
      assert.deepEqual(translateRegionToKo("region", "Italy > Tuscany", dict), {
        ko: "토스카나",
        unknown: false,
      }));
    await test("괄호 노트: '뻬르낭(Pernand)' → 한글 통과", () => {
      const r = translateRegionToKo("region", "뻬르낭(Pernand)", dict);
      assert.equal(r.ko, "뻬르낭");
    });
    await test("영문 미커버 → null + unknown", () =>
      assert.deepEqual(translateRegionToKo("region", "Unknown Land", dict), {
        ko: null,
        unknown: true,
      }));
    await test("한글 미커버 → 그대로 통과", () =>
      assert.deepEqual(translateRegionToKo("region", "희귀한지역", dict), {
        ko: "희귀한지역",
        unknown: false,
      }));
  });

  await group("translateProducer (영문 단일)", async () => {
    await test("null → null + unknown=false", () =>
      assert.deepEqual(translateProducer(null, dict), { en: null, unknown: false }));
    await test("영문 사전 매칭", () =>
      assert.deepEqual(translateProducer("Chateau Margaux", dict), {
        en: "Château Margaux",
        unknown: false,
      }));
    await test("영문 사전 미커버 → 그대로 통과 (정상 영문)", () =>
      assert.deepEqual(translateProducer("Some Random Winery", dict), {
        en: "Some Random Winery",
        unknown: false,
      }));
    await test("한글 사전 매칭 → 영문 변환", () =>
      assert.deepEqual(translateProducer("샤또 마고", dict), {
        en: "Château Margaux",
        unknown: false,
      }));
    await test("한글 사전 미커버 → null + unknown=true (LLM 단계)", () =>
      assert.deepEqual(translateProducer("희귀와이너리", dict), {
        en: null,
        unknown: true,
      }));
    await test("한글 + 괄호 영문 추출: '할란 에스테이트 (Harlan Estate)'", () =>
      assert.deepEqual(translateProducer("할란 에스테이트 (Harlan Estate)", dict), {
        en: "Harlan Estate",
        unknown: false,
      }));
    await test("한글 + 괄호 안 한글 → 괄호 영문 추출 안 됨 → unknown=true", () =>
      assert.deepEqual(translateProducer("할란 (영지)", dict), {
        en: null,
        unknown: true,
      }));
  });

  await group("buildSourceSnapshot", async () => {
    await test("legacy 없음 → null", () =>
      assert.equal(buildSourceSnapshot("admin", undefined), null));
    await test("naver only", () => {
      const r = buildSourceSnapshot("naver_shopping", { naver_link: "https://x", naver_image: "https://y" });
      assert.deepEqual(r, { naver: { link: "https://x", image: "https://y" } });
    });
    await test("gangnam alcohol", () => {
      const r = buildSourceSnapshot("gangnam", { gangnam_alcohol: "13.5%" });
      assert.deepEqual(r, { gangnam: { raw_alcohol_text: "13.5%" } });
    });
    await test("wine21 raw_payload + review_image", () => {
      const r = buildSourceSnapshot("wine21", {
        review_image_url: "https://img.wine21.com/abc.jpg",
        raw_payload: { wine_idx: 123, vintage: "2018", ignored: "x" },
      });
      assert.deepEqual(r, {
        wine21: {
          review_image_url: "https://img.wine21.com/abc.jpg",
          wine_idx: 123,
          vintage: "2018",
        },
      });
    });
  });

  await group("transformInput - 필수 필드 검증", async () => {
    await test("name_ko 누락 → ok:false", async () => {
      const r = await transformInput(fakeSb, {
        source: "admin",
        name_ko: "",
        name_en: "Test",
        country: "France",
        grape_varieties: ["Merlot"],
      } as WinesV2Input, dict);
      assert.equal(r.ok, false);
      if (!r.ok) assert.match(r.error, /필수 필드 누락/);
    });
    await test("country 누락 → ok:false", async () => {
      const r = await transformInput(fakeSb, {
        source: "admin",
        name_ko: "테스트",
        name_en: "Test",
        country: "",
        grape_varieties: ["Merlot"],
      } as WinesV2Input, dict);
      assert.equal(r.ok, false);
    });
    await test("grape_varieties 빈 배열 → ok:false", async () => {
      const r = await transformInput(fakeSb, {
        source: "admin",
        name_ko: "테스트",
        name_en: "Test",
        country: "France",
        grape_varieties: [],
      } as WinesV2Input, dict);
      assert.equal(r.ok, false);
    });
  });

  await group("transformInput - 정상 변환", async () => {
    await test("기본 정상 케이스", async () => {
      const r = await transformInput(fakeSb, {
        source: "wine21",
        name_ko: "샤또 마고 2018",
        name_en: "Chateau Margaux 2018",
        country: "France",
        region: "France / Bordeaux / Médoc",
        wine_type: "Red",
        producer: "Chateau Margaux",
        grape_varieties: ["Cabernet Sauvignon 60%", "Merlot 40%"],
        alcohol: "13.5%",
        price: 500000,
      } as WinesV2Input, dict);
      assert.equal(r.ok, true);
      if (r.ok) {
        assert.equal(r.wineRow.country_ko, "프랑스");
        assert.equal(r.wineRow.region_ko, "메독");
        assert.equal(r.wineRow.wine_type, "red");
        assert.equal(r.wineRow.producer, "Château Margaux");
        assert.equal(r.wineRow.alcohol, 13.5);
        assert.deepEqual(r.wineRow.grape_varieties, ["까베르네 소비뇽", "메를로"]);
        assert.deepEqual(r.wineRow.grape_blend, [
          { grape: "까베르네 소비뇽", percent: 60 },
          { grape: "메를로", percent: 40 },
        ]);
        assert.equal(r.wineRow.needs_review, false);
        assert.equal(r.vivinoRow, null);
      }
    });
    await test("vivino 분리 + autoReviewed (match_score 0.95)", async () => {
      const r = await transformInput(fakeSb, {
        source: "wine21",
        name_ko: "테스트",
        name_en: "Test",
        country: "프랑스",
        grape_varieties: ["Merlot"],
        vivino: {
          url: "https://www.vivino.com/w/123",
          rating: 4.2,
          reviews: 100,
          match_score: 0.95,
        },
      } as WinesV2Input, dict);
      assert.equal(r.ok, true);
      if (r.ok) {
        assert.notEqual(r.vivinoRow, null);
        assert.equal(r.vivinoRow!.needs_review, false);
        assert.notEqual(r.vivinoRow!.reviewed_at, null);
      }
    });
    await test("vivino url 검증 실패 → vivinoRow null + needs_review", async () => {
      const r = await transformInput(fakeSb, {
        source: "admin",
        name_ko: "테스트",
        name_en: "Test",
        country: "프랑스",
        grape_varieties: ["Merlot"],
        vivino: { url: "https://google.com/" },
      } as WinesV2Input, dict);
      assert.equal(r.ok, true);
      if (r.ok) {
        assert.equal(r.vivinoRow, null);
        assert.equal(r.wineRow.needs_review, true);
        assert.ok(r.needs_review_reasons.includes("vivino:invalid_url"));
      }
    });
    await test("영문 미커버 country → 그대로 통과 + needs_review", async () => {
      const r = await transformInput(fakeSb, {
        source: "admin",
        name_ko: "테스트",
        name_en: "Test",
        country: "Atlantis",
        grape_varieties: ["Merlot"],
      } as WinesV2Input, dict);
      assert.equal(r.ok, true);
      if (r.ok) {
        assert.equal(r.wineRow.country_ko, "Atlantis");
        assert.equal(r.wineRow.needs_review, true);
      }
    });
  });

  await group("buildUpdatePatch", async () => {
    const baseCurrent: Pick<
      WinesV2Row,
      | "name_ko" | "name_en" | "wine_type" | "wine_style" | "country_ko" | "region_ko"
      | "producer" | "grape_varieties" | "grape_blend" | "alcohol" | "brand"
      | "price" | "description" | "image_url" | "locked_fields" | "source_refs" | "source_snapshot"
    > = {
      name_ko: "기존",
      name_en: "Existing",
      wine_type: "red",
      wine_style: null,
      country_ko: "프랑스",
      region_ko: null,
      producer: "Existing Winery",
      grape_varieties: ["메를로"],
      grape_blend: null,
      alcohol: 13,
      brand: null,
      price: null,
      description: null,
      image_url: null,
      locked_fields: null,
      source_refs: null,
      source_snapshot: null,
    };

    await test("region 추가", async () => {
      const r = await buildUpdatePatch(fakeSb, baseCurrent, { region: "Bordeaux" }, { dict });
      assert.equal(r.wineUpdate.region_ko, "보르도");
    });
    await test("locked_fields 보호", async () => {
      const r = await buildUpdatePatch(
        fakeSb,
        { ...baseCurrent, locked_fields: ["producer"] },
        { producer: "New Winery" },
        { dict },
      );
      assert.equal(r.wineUpdate.producer, undefined); // locked → 변경 안 됨
    });
    await test("fillEmptyOnly: 비어있는 필드만", async () => {
      const r = await buildUpdatePatch(
        fakeSb,
        baseCurrent,
        { producer: "New Winery", region: "Bordeaux" },
        { dict, fillEmptyOnly: true },
      );
      // producer는 이미 있음 → 무시. region은 NULL → 채움
      assert.equal(r.wineUpdate.producer, undefined);
      assert.equal(r.wineUpdate.region_ko, "보르도");
    });
    await test("vivino: null → vivinoDelete=true", async () => {
      const r = await buildUpdatePatch(fakeSb, baseCurrent, { vivino: null }, { dict });
      assert.equal(r.vivinoDelete, true);
      assert.equal(r.vivinoUpsert, null);
    });
    await test("vivino 정상 → vivinoUpsert", async () => {
      const r = await buildUpdatePatch(
        fakeSb,
        baseCurrent,
        {
          vivino: {
            url: "https://www.vivino.com/w/456",
            rating: 4.5,
            match_score: 0.95,
          },
        },
        { dict },
      );
      assert.notEqual(r.vivinoUpsert, null);
      assert.equal(r.vivinoUpsert!.needs_review, false);
    });
  });

  // 결과 출력
  console.log(`\n========================`);
  console.log(`총 ${passed + failed}개 — 통과 ${passed} / 실패 ${failed}`);
  if (failed > 0) {
    console.log(`\n실패한 테스트:`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("테스트 실행 자체 실패:", e);
  process.exit(1);
});
