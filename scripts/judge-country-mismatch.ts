import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const countryMap: Record<string, string> = {
  "프랑스": "France", "이탈리아": "Italy", "미국": "United States",
  "호주": "Australia", "오스트레일리아": "Australia", "칠레": "Chile",
  "아르헨티나": "Argentina", "스페인": "Spain", "독일": "Germany",
  "뉴질랜드": "New Zealand", "남아프리카공화국": "South Africa",
  "남아프리카": "South Africa", "남아공": "South Africa",
  "포르투갈": "Portugal", "그리스": "Greece", "조지아": "Georgia",
  "그루지야": "Georgia", "헝가리": "Hungary", "슬로베니아": "Slovenia",
  "한국": "South Korea",
};

// 브랜드/생산자 → 국가 매핑 (잘 알려진 브랜드)
const brandCountry: [RegExp, string][] = [
  // Chile
  [/디아블로|diablo/i, "Chile"],              // Concha y Toro - Casillero del Diablo
  [/얄리|yali/i, "Chile"],                     // Viña Ventisquero
  [/G7/i, "Chile"],                             // Viña del Pedregal
  [/까사 엘 토키|casa el toqui/i, "Chile"],
  [/노스트로스|nostros/i, "Chile"],             // Viña Emiliana
  [/댄싱 플레임|dancing flame/i, "Chile"],
  [/1865/i, "Chile"],                           // Viña San Pedro
  [/몬테스|montes/i, "Chile"],
  [/콘차이토로|concha/i, "Chile"],
  [/디아블로 퍼플/i, "Chile"],

  // Australia
  [/카트눅|katnook/i, "Australia"],
  [/젠틀맨즈 컬렉션|gentleman/i, "Australia"], // Lindeman's
  [/킹스 오브 프로히비션|kings of prohibition/i, "Australia"],
  [/코알라|koala/i, "Australia"],
  [/그로어스 터치|grower/i, "Australia"],
  [/닥터 린드만|lindeman/i, "Australia"],
  [/트레드 소프틀리|tread softly/i, "Australia"],
  [/앙고브|angove/i, "Australia"],
  [/알파 박스|alpha box/i, "Australia"],
  [/모조 03/i, "Australia"],                    // McLaren Vale producer
  [/윌라켄지|willakenzie/i, "United States"],   // Oregon
  [/토페.*오스몬드/i, "Australia"],

  // New Zealand
  [/쌩 클레어|saint clair|st\.? clair/i, "New Zealand"],
  [/셔우드|sherwood/i, "New Zealand"],

  // France
  [/미쉘린취.*보르도|보르도.*소비뇽/i, "France"],
  [/비엘 어데이지|vieil adage/i, "France"],
  [/유미.*가르고뜨|gargotte/i, "France"],
  [/스마일리 므왈레|moelleux/i, "France"],       // Moelleux = French
  [/로저 구라트|roger goulart/i, "Spain"],       // Cava producer
  [/프레스코발디 아템스|frescobaldi attems|attems/i, "Italy"], // Friuli
  [/조셉 페블레.*부르고뉴|부르고뉴.*피노/i, "France"],

  // Argentina
  [/브로켈|broquel/i, "Argentina"],             // Trapiche
  [/이스까이|iscay/i, "Argentina"],             // Trapiche
  [/19 크라임스 말벡|19크라임스.*말벡/i, "Argentina"],
  [/떼루뇨|terruño/i, "Argentina"],

  // United States
  [/콜럼비아 투바인|columbia/i, "United States"],
  [/탈보트 칼리 하트|talbott kali/i, "United States"],
  [/19크라임스 칼리|19 crimes cali/i, "United States"],

  // Spain
  [/20 알데아스|aldeas/i, "Spain"],
  [/데툰다|detunda/i, "Spain"],
  [/아비뇨 페티앙/i, "Spain"],

  // Germany
  [/투썩 점퍼.*사슴.*리슬링|투썩.*리슬링/i, "Germany"],

  // Multi-country brands (Tussock Jumper varies by wine)
  [/투썩 점퍼.*피노 그리지오|투썩.*그리지오/i, "Italy"],

  // Others
  [/와인 메카닉/i, "Sweden"],
  [/월드 빈야드 칠레/i, "Chile"],              // 이름에 "칠레" 포함
  [/풋프린트|footprint/i, "South Africa"],
  [/더치 홉/i, "South Africa"],
  [/엘 오페라 디 로쏘/i, "Italy"],             // "di Rosso" is Italian
  [/프레시넷|freixenet/i, "Spain"],
  [/카사 트라몬토/i, "Italy"],                  // Italian name
  [/레 프레 베/i, "France"],                    // French name
];

async function main() {
  let wines: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("wines")
      .select("id, name_ko, name_en, country, region, vivino_region")
      .not("vivino_page_url", "is", null)
      .range(from, from + 999);
    if (error) { console.error(error); process.exit(1); }
    wines = wines.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }

  // 국가 불일치 필터
  const mismatches: any[] = [];
  for (const w of wines) {
    if (!w.vivino_region || !w.country) continue;
    const vivinoCountry = w.vivino_region.split(" / ")[0];
    const naverEn = countryMap[w.country.trim()] || w.country.trim();
    if (naverEn.toLowerCase() !== vivinoCountry.toLowerCase()) {
      mismatches.push({ ...w, vivinoCountry });
    }
  }

  const vivinoCorrect: any[] = [];
  const naverCorrect: any[] = [];
  const uncertain: any[] = [];

  for (const w of mismatches) {
    const nameToCheck = `${w.name_ko} ${w.name_en || ""}`;
    let judged = false;

    for (const [pattern, correctCountry] of brandCountry) {
      if (pattern.test(nameToCheck)) {
        const naverEn = countryMap[w.country.trim()] || w.country.trim();
        if (correctCountry === w.vivinoCountry) {
          vivinoCorrect.push({ ...w, correctCountry, reason: pattern.source });
        } else if (correctCountry === naverEn) {
          naverCorrect.push({ ...w, correctCountry, reason: pattern.source });
        } else {
          // 둘 다 아님
          uncertain.push({ ...w, note: `브랜드 판단: ${correctCountry}, 네이버: ${naverEn}, Vivino: ${w.vivinoCountry}` });
        }
        judged = true;
        break;
      }
    }

    if (!judged) {
      uncertain.push({ ...w, note: "브랜드 매핑 없음" });
    }
  }

  console.log(`=== 판단 결과 요약 ===`);
  console.log(`Vivino가 맞음 (네이버 수정 필요): ${vivinoCorrect.length}개`);
  console.log(`네이버가 맞음 (Vivino 매칭 오류): ${naverCorrect.length}개`);
  console.log(`판단 불가: ${uncertain.length}개`);

  const vivinoToKo: Record<string, string> = {
    "France": "프랑스", "Italy": "이탈리아", "United States": "미국",
    "Australia": "호주", "Chile": "칠레", "Argentina": "아르헨티나",
    "Spain": "스페인", "Germany": "독일", "New Zealand": "뉴질랜드",
    "South Africa": "남아프리카공화국", "Portugal": "포르투갈",
    "Sweden": "스웨덴", "Switzerland": "스위스", "Slovenia": "슬로베니아",
    "Romania": "루마니아", "Georgia": "조지아", "Hungary": "헝가리",
    "Canada": "캐나다", "Uruguay": "우루과이", "Bolivia": "볼리비아",
    "Russia": "러시아",
  };

  console.log(`\n=== Vivino가 맞음 → 네이버 country 수정 대상 ===`);
  for (const w of vivinoCorrect) {
    const koCountry = vivinoToKo[w.vivinoCountry] || w.vivinoCountry;
    console.log(`  ${w.name_ko}: "${w.country}" → "${koCountry}" (${w.vivinoCountry})`);
  }

  console.log(`\n=== 네이버가 맞음 → Vivino 매칭이 잘못됨 (수정 안함) ===`);
  for (const w of naverCorrect) {
    console.log(`  ${w.name_ko}: 네이버 "${w.country}" 유지 (Vivino 잘못 매칭: ${w.vivinoCountry})`);
  }

  console.log(`\n=== 판단 불가 (수동 검토 필요) ===`);
  for (const w of uncertain) {
    console.log(`  ${w.name_ko}: 네이버 "${w.country}" vs Vivino "${w.vivinoCountry}" — ${w.note}`);
  }

  // --apply 옵션으로 Vivino 맞는 것만 업데이트
  if (process.argv.includes("--apply")) {
    console.log(`\n=== Vivino 맞는 ${vivinoCorrect.length}개 업데이트 실행 ===`);
    let success = 0;
    for (const w of vivinoCorrect) {
      const koCountry = vivinoToKo[w.vivinoCountry] || w.vivinoCountry;
      const skipSegments = new Set([
        "Northern Italy", "Central Italy", "Southern Italy",
        "South Island", "North Island",
        "South Australia", "New South Wales", "Western Australia", "Victoria", "Tasmania", "Queensland",
      ]);
      const segments = w.vivino_region.split(" / ");
      let newRegion: string | undefined;
      if (!w.region || w.region === "" || w.region === "null" || w.region === "미정") {
        if (segments.length >= 2) {
          newRegion = skipSegments.has(segments[1]) && segments.length >= 3 ? segments[2] : segments[1];
        }
      }
      const updates: Record<string, any> = { country: koCountry, updated_at: new Date().toISOString() };
      if (newRegion) updates.region = newRegion;
      const { error } = await supabase.from("wines").update(updates).eq("id", w.id);
      if (error) {
        console.error(`  ✗ ${w.name_ko}: ${error.message}`);
      } else {
        const regionMsg = newRegion ? `, region → "${newRegion}"` : "";
        console.log(`  ✓ ${w.name_ko}: "${w.country}" → "${koCountry}"${regionMsg}`);
        success++;
      }
    }
    console.log(`\n완료: ${success}/${vivinoCorrect.length}`);
  }
}

main().catch(console.error);
