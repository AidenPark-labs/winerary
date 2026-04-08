import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 네이버 국가 → Vivino 국가 매핑
const countryMap: Record<string, string> = {
  "프랑스": "France",
  "이탈리아": "Italy",
  "미국": "United States",
  "호주": "Australia",
  "오스트레일리아": "Australia",
  "칠레": "Chile",
  "아르헨티나": "Argentina",
  "스페인": "Spain",
  "독일": "Germany",
  "뉴질랜드": "New Zealand",
  "남아프리카공화국": "South Africa",
  "남아프리카": "South Africa",
  "남아공": "South Africa",
  "포르투갈": "Portugal",
  "그리스": "Greece",
  "조지아": "Georgia",
  "그루지야": "Georgia",
  "헝가리": "Hungary",
  "오스트리아": "Austria",
  "스웨덴": "Sweden",
  "러시아": "Russia",
  "슬로베니아": "Slovenia",
  "루마니아": "Romania",
  "한국": "South Korea",
  "캐나다": "Canada",
  "우루과이": "Uruguay",
  "볼리비아": "Bolivia",
  "스위스": "Switzerland",
};

// 미상/미정/알 수 없음 판별
const unknownValues = new Set([
  "미상", "미정", "알 수 없음", "알려지지 않음", "", "null",
]);

function isUnknown(val: string | null): boolean {
  if (!val) return true;
  return unknownValues.has(val.trim());
}

// Vivino 국가 → 한글 국가명 역매핑
const vivinoToKo: Record<string, string> = {};
for (const [ko, en] of Object.entries(countryMap)) {
  // 가장 일반적인 한글명 우선 (나중에 덮어씀)
  vivinoToKo[en] = ko;
}
// 선호 한글명 수동 지정
vivinoToKo["Australia"] = "호주";
vivinoToKo["South Africa"] = "남아프리카공화국";
vivinoToKo["United States"] = "미국";
vivinoToKo["Georgia"] = "조지아";

const skipSegments = new Set([
  "Northern Italy", "Central Italy", "Southern Italy",
  "South Island", "North Island",
  "South Australia", "New South Wales", "Western Australia", "Victoria", "Tasmania", "Queensland",
]);

function extractRegion(vivinoRegion: string): string {
  const segments = vivinoRegion.split(" / ");
  if (segments.length < 2) return segments[0];
  if (skipSegments.has(segments[1]) && segments.length >= 3) {
    return segments[2];
  }
  return segments[1];
}

async function main() {
  let wines: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("wines")
      .select("id, name_ko, country, region, vivino_region, grape_variety, vivino_grapes")
      .not("vivino_page_url", "is", null)
      .range(from, from + 999);
    if (error) { console.error(error); process.exit(1); }
    wines = wines.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }

  console.log(`전체 대상 와인: ${wines.length}개\n`);

  // ── 유형1: 네이버 국가가 미상/미정인데 Vivino에 있는 경우 ──
  const type1: any[] = [];
  // ── 유형3: 진짜 국가 불일치 (검토용) ──
  const type3: any[] = [];

  for (const w of wines) {
    if (!w.vivino_region) continue;
    const vivinoCountry = w.vivino_region.split(" / ")[0];

    if (isUnknown(w.country)) {
      // 유형1: 미상 → Vivino로 채우기
      type1.push({ ...w, vivinoCountry });
    } else {
      // 국가 비교
      const naverCountryEn = countryMap[w.country.trim()] || w.country.trim();
      if (naverCountryEn.toLowerCase() !== vivinoCountry.toLowerCase()) {
        // 유형3: 진짜 불일치
        type3.push({ ...w, vivinoCountry });
      }
    }
  }

  console.log(`유형1 (미상 → Vivino로 채우기): ${type1.length}개`);
  console.log(`유형3 (진짜 국가 불일치, 검토 필요): ${type3.length}개`);

  const DRY_RUN = process.argv.includes("--dry-run");

  // ── 유형1 실행 ──
  console.log(`\n=== 유형1: 미상/미정 국가 채우기 ===`);
  let success = 0;
  let fail = 0;
  for (const w of type1) {
    const koCountry = vivinoToKo[w.vivinoCountry] || w.vivinoCountry;
    const vivinoRegionValue = extractRegion(w.vivino_region);

    const updates: Record<string, any> = {
      country: koCountry,
      updated_at: new Date().toISOString(),
    };

    // region도 비어있으면 같이 채우기
    if (isUnknown(w.region)) {
      updates.region = vivinoRegionValue;
    }

    // grape_variety도 비어있으면 같이 채우기
    if (isUnknown(w.grape_variety) && w.vivino_grapes) {
      updates.grape_variety = w.vivino_grapes;
    }

    if (DRY_RUN) {
      const regionMsg = updates.region ? `, region: "${w.region}" → "${updates.region}"` : "";
      const grapeMsg = updates.grape_variety ? `, grape: "${w.grape_variety}" → "${updates.grape_variety}"` : "";
      console.log(`  ${w.name_ko}: country "${w.country}" → "${koCountry}"${regionMsg}${grapeMsg}`);
    } else {
      const { error } = await supabase.from("wines").update(updates).eq("id", w.id);
      if (error) {
        console.error(`  ✗ ${w.name_ko}: ${error.message}`);
        fail++;
      } else {
        const regionMsg = updates.region ? `, region → "${updates.region}"` : "";
        const grapeMsg = updates.grape_variety ? `, grape → "${updates.grape_variety}"` : "";
        console.log(`  ✓ ${w.name_ko}: "${w.country}" → "${koCountry}"${regionMsg}${grapeMsg}`);
        success++;
      }
    }
  }

  if (!DRY_RUN) {
    console.log(`\n유형1 완료: ${success}개 성공, ${fail}개 실패`);
  }

  // ── 유형3 출력 (검토용) ──
  console.log(`\n=== 유형3: 국가 불일치 (검토 필요) ${type3.length}개 ===`);
  for (const w of type3) {
    console.log(`  ${w.name_ko}`);
    console.log(`    네이버: ${w.country} / ${w.region || "(없음)"}`);
    console.log(`    Vivino: ${w.vivino_region}`);
  }
}

main().catch(console.error);
