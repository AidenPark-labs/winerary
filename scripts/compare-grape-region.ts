import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── 포도품종 한글→영문 매핑 ──
const grapeMap: Record<string, string[]> = {
  "까베르네 소비뇽": ["cabernet sauvignon"],
  "카베르네 소비뇽": ["cabernet sauvignon"],
  "까베르네 프랑": ["cabernet franc"],
  "카베르네 프랑": ["cabernet franc"],
  "메를로": ["merlot"],
  "피노 누아": ["pinot noir"],
  "피노누아": ["pinot noir"],
  "피노 누아르": ["pinot noir"],
  "쉬라즈": ["shiraz", "syrah", "shiraz/syrah"],
  "시라": ["syrah", "shiraz", "shiraz/syrah"],
  "시라즈": ["shiraz", "syrah", "shiraz/syrah"],
  "샤르도네": ["chardonnay"],
  "소비뇽 블랑": ["sauvignon blanc"],
  "소비뇽블랑": ["sauvignon blanc"],
  "리슬링": ["riesling"],
  "산지오베제": ["sangiovese"],
  "템프라니요": ["tempranillo"],
  "말벡": ["malbec"],
  "네비올로": ["nebbiolo"],
  "모스카토": ["moscato", "muscat"],
  "글레라": ["glera"],
  "가메": ["gamay"],
  "가르나차": ["garnacha", "grenache"],
  "그르나슈": ["grenache", "garnacha"],
  "그르나쉬": ["grenache", "garnacha"],
  "진판델": ["zinfandel"],
  "피노 그리": ["pinot gris", "pinot grigio"],
  "피노 그리지오": ["pinot grigio", "pinot gris"],
  "피노그리": ["pinot gris", "pinot grigio"],
  "게뷔르츠트라미너": ["gewürztraminer", "gewurztraminer"],
  "비오니에": ["viognier"],
  "세미용": ["sémillon", "semillon"],
  "쁘띠 베르도": ["petit verdot"],
  "프티 베르도": ["petit verdot"],
  "뮈스카데": ["muscadet", "melon de bourgogne"],
  "무르베드르": ["mourvèdre", "mourvedre"],
  "카리냥": ["carignan"],
  "알바리뇨": ["albariño", "albarino"],
  "베르멘티노": ["vermentino"],
  "트레비아노": ["trebbiano"],
  "코르비나": ["corvina"],
  "바르베라": ["barbera"],
  "돌체토": ["dolcetto"],
  "토론테스": ["torrontés", "torrontes"],
  "까르메네르": ["carménère", "carmenere"],
  "카르메네르": ["carménère", "carmenere"],
  "마르산느": ["marsanne"],
  "루산느": ["roussanne"],
  "뮈스카": ["muscat", "moscato"],
  "피노 블랑": ["pinot blanc"],
  "피노 뫼니에": ["pinot meunier"],
  "쉬냉 블랑": ["chenin blanc"],
  "슈냉 블랑": ["chenin blanc"],
  "블렌드": ["blend"],
  "그뤼너 벨트리너": ["grüner veltliner", "gruner veltliner"],
  "프리미티보": ["primitivo"],
  "아리아니코": ["aglianico"],
  "투리가 나시오날": ["touriga nacional"],
  "피노타지": ["pinotage"],
  "모나스트렐": ["monastrell", "mourvèdre", "mourvedre"],
  "네로 다볼라": ["nero d'avola"],
  "비우라": ["viura", "macabeo"],
  "마카베오": ["macabeo", "viura"],
  "샤도네": ["chardonnay"],
  "샤도네이": ["chardonnay"],
  "멜롯": ["merlot"],
  "메를롯": ["merlot"],
  "까르미네르": ["carménère", "carmenere"],
  "피노그리지오": ["pinot grigio", "pinot gris"],
  "몬테풀치아노": ["montepulciano"],
  "람부르스코": ["lambrusco"],
  "브루넬로": ["sangiovese", "brunello"],
  "까베르네": ["cabernet sauvignon"],
  "쉬라": ["syrah", "shiraz", "shiraz/syrah"],
  "무흐베드르": ["mourvedre", "mourvèdre"],
  "프로세코": ["glera", "prosecco"],
  "뮈스까": ["muscat", "muscat blanc", "moscato"],
  "피노": ["pinot noir", "pinot bianco", "pinot blanc"],
  "그르나슈 누아": ["grenache"],
  "쁘띠 쉬라": ["petite sirah", "petit sirah"],
  "카베르네소비뇽": ["cabernet sauvignon"],
  "소비뇽블랑": ["sauvignon blanc"],
  "산지오베세": ["sangiovese"],
  "카버넷": ["cabernet sauvignon"],
  "리슬링": ["riesling"],
  "마타로": ["mataro", "mourvèdre", "mourvedre"],
  "파렐라다": ["parellada"],
  "베르데호": ["verdejo"],
  "그릴로": ["grillo"],
};

// ── 지역 한글→영문 매핑 ──
const regionMap: Record<string, string[]> = {
  "보르도": ["bordeaux"],
  "부르고뉴": ["bourgogne", "burgundy"],
  "샹파뉴": ["champagne"],
  "샴페인": ["champagne"],
  "론": ["rhône", "rhone"],
  "알자스": ["alsace"],
  "루아르": ["loire"],
  "프로방스": ["provence"],
  "랑그독": ["languedoc"],
  "토스카나": ["toscana", "tuscany"],
  "피에몬테": ["piemonte", "piedmont"],
  "베네토": ["veneto"],
  "시칠리아": ["sicilia", "sicily"],
  "캘리포니아": ["california"],
  "나파 밸리": ["napa valley", "napa county"],
  "소노마": ["sonoma"],
  "소노마 카운티": ["sonoma county"],
  "오리건": ["oregon"],
  "오레곤": ["oregon"],
  "워싱턴": ["washington"],
  "남호주": ["south australia", "south eastern australia"],
  "바로사 밸리": ["barossa", "barossa valley"],
  "맥라렌 베일": ["mclaren vale"],
  "말보로": ["marlborough"],
  "멘도자": ["mendoza"],
  "리오하": ["rioja"],
  "카탈루냐": ["catalonia", "catalunya"],
  "모젤": ["mosel"],
  "라인가우": ["rheingau"],
  "팔츠": ["pfalz"],
  "스텔렌보쉬": ["stellenbosch"],
  "마이포 밸리": ["maipo valley", "maipo"],
  "콜차구아 밸리": ["colchagua valley", "colchagua"],
  "센트럴 밸리": ["central valley"],
  "카사블랑카 밸리": ["casablanca valley", "casablanca"],
  "센트럴 코스트": ["central coast"],
  "파소 로블스": ["paso robles"],
  "러시안 리버 밸리": ["russian river valley"],
  "윌라멧 밸리": ["willamette valley"],
  "쿠나와라": ["coonawarra"],
  "헌터 밸리": ["hunter valley"],
  "호크스 베이": ["hawke's bay", "hawkes bay"],
  "도우로": ["douro"],
  "포르투": ["porto"],
  "아브루쪼": ["abruzzo"],
  "움브리아": ["umbria"],
  "풀리아": ["puglia"],
  "사르데냐": ["sardegna", "sardinia"],
  "캄파니아": ["campania"],
  "트렌티노": ["trentino"],
  "알토 아디제": ["alto adige"],
  "프리울리": ["friuli"],
  "롬바르디아": ["lombardia", "lombardy"],
  "카탈루냐": ["catalonia", "catalunya", "cava", "penedès", "penedes"],
  "도우로": ["douro", "duriense", "porto"],
  "포르투": ["porto", "duriense"],
  "꼬뜨 뒤 론": ["rhône", "rhone", "côtes-du-rhône", "cotes-du-rhone"],
  "롱그독": ["languedoc"],
  "펜에데스": ["penedès", "penedes"],
  "배녹번": ["bannockburn", "central otago"],
  "미정": [],
};

function normalizeGrape(s: string): string[] {
  return s
    .replace(/100%\s*/gi, "")
    .split(/[,/·&]+/)
    .map((g) => g.trim().toLowerCase())
    .filter(Boolean);
}

function translateGrapesKoToEn(koGrapes: string[]): string[] {
  return koGrapes.flatMap((ko) => {
    const mapped = grapeMap[ko];
    if (mapped) return mapped;
    // 이미 영문인 경우
    if (/^[a-z]/.test(ko)) return [ko];
    return [ko]; // 매핑 없으면 원본 유지
  });
}

function grapesSame(naverRaw: string, vivinoRaw: string): { same: boolean; reason?: string } {
  const naverGrapes = normalizeGrape(naverRaw);
  const vivinoGrapes = normalizeGrape(vivinoRaw);
  const naverEn = translateGrapesKoToEn(naverGrapes);

  // 각 네이버 품종이 비비노에 포함되는지 확인
  const naverInVivino = naverEn.every((ne) =>
    vivinoGrapes.some((vg) => vg.includes(ne) || ne.includes(vg))
  );
  const vivinoInNaver = vivinoGrapes.every((vg) =>
    naverEn.some((ne) => ne.includes(vg) || vg.includes(ne))
  );

  if (naverInVivino && vivinoInNaver) {
    return { same: true };
  }

  // 네이버가 비비노의 부분집합인 경우 (비비노가 더 상세)
  if (naverInVivino && !vivinoInNaver) {
    return { same: false, reason: "VIVINO_MORE_DETAIL" };
  }

  // 비비노가 네이버의 부분집합인 경우
  if (!naverInVivino && vivinoInNaver) {
    return { same: false, reason: "NAVER_MORE_DETAIL" };
  }

  return { same: false, reason: "DIFFERENT" };
}

function regionSame(naverRaw: string, vivinoRaw: string): { same: boolean; reason?: string } {
  const vivinoLower = vivinoRaw.toLowerCase();
  const naverLower = naverRaw.toLowerCase().trim();

  // 직접 포함 확인 (영문 네이버 지역이 Vivino 계층에 포함)
  if (vivinoLower.includes(naverLower) && naverLower.length > 2) {
    return { same: true };
  }

  // 한글→영문 매핑 후 포함 확인
  const mapped = regionMap[naverRaw.trim()];
  if (mapped) {
    const found = mapped.some((en) => vivinoLower.includes(en));
    if (found) return { same: true };
    // 매핑은 있지만 Vivino 지역에 안 포함됨 → 실제 불일치
    return { same: false, reason: "DIFFERENT" };
  }

  // 매핑 없음 - 미확인
  return { same: false, reason: "UNKNOWN_MAPPING" };
}

async function main() {
  // Paginated fetch
  let wines: any[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("wines")
      .select(
        "id, name_ko, name_en, wine_type, country, region, grape_variety, producer, vivino_winery, vivino_grapes, vivino_region, vivino_style, vivino_alcohol, vivino_url, vivino_page_url"
      )
      .not("vivino_page_url", "is", null)
      .range(from, from + pageSize - 1);
    if (error) { console.error(error); process.exit(1); }
    wines = wines.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  console.log(`전체 Vivino 데이터 보유 와인: ${wines.length}개\n`);

  // ── 포도품종 비교 ──
  const grapeResults = { same: 0, vivinoMore: 0, naverMore: 0, different: 0, unknownMapping: 0 };
  const grapeDifferent: any[] = [];
  const grapeVivinoMore: any[] = [];
  const grapeNaverMore: any[] = [];
  const grapeUnknown: any[] = [];

  for (const w of wines) {
    if (!w.grape_variety || !w.vivino_grapes) continue;
    const result = grapesSame(w.grape_variety, w.vivino_grapes);
    if (result.same) {
      grapeResults.same++;
    } else if (result.reason === "VIVINO_MORE_DETAIL") {
      grapeResults.vivinoMore++;
      grapeVivinoMore.push(w);
    } else if (result.reason === "NAVER_MORE_DETAIL") {
      grapeResults.naverMore++;
      grapeNaverMore.push(w);
    } else if (result.reason === "DIFFERENT") {
      grapeResults.different++;
      grapeDifferent.push(w);
    } else {
      grapeResults.unknownMapping++;
      grapeUnknown.push(w);
    }
  }

  console.log("========================================");
  console.log("  포도품종 비교 결과");
  console.log("========================================");
  console.log(`✓ 일치 (번역 차이만): ${grapeResults.same}개`);
  console.log(`△ Vivino가 더 상세: ${grapeResults.vivinoMore}개`);
  console.log(`△ 네이버가 더 상세: ${grapeResults.naverMore}개`);
  console.log(`✗ 불일치 (실제 다름): ${grapeResults.different}개`);
  console.log(`? 매핑 없음 (확인 필요): ${grapeResults.unknownMapping}개`);

  if (grapeDifferent.length > 0) {
    console.log(`\n── 포도품종 불일치 (실제 다름) ${grapeDifferent.length}개 ──`);
    for (const w of grapeDifferent) {
      console.log(`  ${w.name_ko}`);
      console.log(`    네이버: ${w.grape_variety}`);
      console.log(`    Vivino: ${w.vivino_grapes}`);
    }
  }

  if (grapeVivinoMore.length > 0) {
    console.log(`\n── 포도품종: Vivino가 더 상세 (상위 ${Math.min(20, grapeVivinoMore.length)}개) ──`);
    for (const w of grapeVivinoMore.slice(0, 20)) {
      console.log(`  ${w.name_ko}  |  네이버: ${w.grape_variety}  →  Vivino: ${w.vivino_grapes}`);
    }
  }

  if (grapeNaverMore.length > 0) {
    console.log(`\n── 포도품종: 네이버가 더 상세 (상위 ${Math.min(20, grapeNaverMore.length)}개) ──`);
    for (const w of grapeNaverMore.slice(0, 20)) {
      console.log(`  ${w.name_ko}  |  네이버: ${w.grape_variety}  →  Vivino: ${w.vivino_grapes}`);
    }
  }

  if (grapeUnknown.length > 0) {
    console.log(`\n── 포도품종: 매핑 없음 (상위 ${Math.min(30, grapeUnknown.length)}개) ──`);
    for (const w of grapeUnknown.slice(0, 30)) {
      console.log(`  ${w.name_ko}  |  네이버: ${w.grape_variety}  →  Vivino: ${w.vivino_grapes}`);
    }
  }

  // ── 지역 비교 ──
  const regionResults = { same: 0, different: 0, unknownMapping: 0 };
  const regionDifferent: any[] = [];
  const regionUnknown: any[] = [];

  for (const w of wines) {
    if (!w.region || !w.vivino_region) continue;
    const result = regionSame(w.region, w.vivino_region);
    if (result.same) {
      regionResults.same++;
    } else if (result.reason === "DIFFERENT") {
      regionResults.different++;
      regionDifferent.push(w);
    } else {
      regionResults.unknownMapping++;
      regionUnknown.push(w);
    }
  }

  console.log("\n\n========================================");
  console.log("  지역 비교 결과");
  console.log("========================================");
  console.log(`✓ 일치 (네이버 지역이 Vivino 계층에 포함): ${regionResults.same}개`);
  console.log(`✗ 불일치 (실제 다름): ${regionResults.different}개`);
  console.log(`? 매핑 없음 (확인 필요): ${regionResults.unknownMapping}개`);

  if (regionDifferent.length > 0) {
    console.log(`\n── 지역 불일치 (실제 다름) ${regionDifferent.length}개 ──`);
    for (const w of regionDifferent) {
      console.log(`  ${w.name_ko}`);
      console.log(`    네이버: ${w.region}`);
      console.log(`    Vivino: ${w.vivino_region}`);
    }
  }

  if (regionUnknown.length > 0) {
    console.log(`\n── 지역: 매핑 없음 (상위 ${Math.min(30, regionUnknown.length)}개) ──`);
    for (const w of regionUnknown.slice(0, 30)) {
      console.log(`  ${w.name_ko}  |  네이버: ${w.region}  →  Vivino: ${w.vivino_region}`);
    }
  }

  // ── CSV 저장 ──
  const allRows: string[] = ["type,status,name_ko,name_en,naver_value,vivino_value,id"];

  for (const w of grapeDifferent) {
    allRows.push(`grape,DIFFERENT,"${esc(w.name_ko)}","${esc(w.name_en)}","${esc(w.grape_variety)}","${esc(w.vivino_grapes)}",${w.id}`);
  }
  for (const w of grapeVivinoMore) {
    allRows.push(`grape,VIVINO_MORE,"${esc(w.name_ko)}","${esc(w.name_en)}","${esc(w.grape_variety)}","${esc(w.vivino_grapes)}",${w.id}`);
  }
  for (const w of grapeNaverMore) {
    allRows.push(`grape,NAVER_MORE,"${esc(w.name_ko)}","${esc(w.name_en)}","${esc(w.grape_variety)}","${esc(w.vivino_grapes)}",${w.id}`);
  }
  for (const w of grapeUnknown) {
    allRows.push(`grape,UNKNOWN,"${esc(w.name_ko)}","${esc(w.name_en)}","${esc(w.grape_variety)}","${esc(w.vivino_grapes)}",${w.id}`);
  }
  for (const w of regionDifferent) {
    allRows.push(`region,DIFFERENT,"${esc(w.name_ko)}","${esc(w.name_en)}","${esc(w.region)}","${esc(w.vivino_region)}",${w.id}`);
  }
  for (const w of regionUnknown) {
    allRows.push(`region,UNKNOWN,"${esc(w.name_ko)}","${esc(w.name_en)}","${esc(w.region)}","${esc(w.vivino_region)}",${w.id}`);
  }

  fs.writeFileSync("wine-grape-region-comparison.csv", allRows.join("\n"), "utf-8");
  console.log(`\nCSV 저장: wine-grape-region-comparison.csv (${allRows.length - 1}건)`);
}

function esc(s: string | null): string {
  return (s || "").replace(/"/g, '""');
}

main().catch(console.error);
