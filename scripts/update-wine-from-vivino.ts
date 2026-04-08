import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── 포도품종 한글→영문 매핑 (compare-grape-region.ts 와 동일) ──
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
  "마타로": ["mataro", "mourvèdre", "mourvedre"],
  "파렐라다": ["parellada"],
  "베르데호": ["verdejo"],
  "그릴로": ["grillo"],
};

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
  "카탈루냐": ["catalonia", "catalunya", "cava", "penedès", "penedes"],
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
  "도우로": ["douro", "duriense", "porto"],
  "포르투": ["porto", "duriense"],
  "아브루쪼": ["abruzzo"],
  "움브리아": ["umbria"],
  "풀리아": ["puglia"],
  "사르데냐": ["sardegna", "sardinia"],
  "캄파니아": ["campania"],
  "트렌티노": ["trentino"],
  "알토 아디제": ["alto adige"],
  "프리울리": ["friuli"],
  "롬바르디아": ["lombardia", "lombardy"],
  "꼬뜨 뒤 론": ["rhône", "rhone", "côtes-du-rhône", "cotes-du-rhone"],
  "롱그독": ["languedoc"],
  "펜에데스": ["penedès", "penedes"],
  "배녹번": ["bannockburn", "central otago"],
  "미정": [],
};

function normalizeGrape(s: string): string[] {
  return s.replace(/100%\s*/gi, "").split(/[,/·&]+/).map((g) => g.trim().toLowerCase()).filter(Boolean);
}

function translateGrapesKoToEn(koGrapes: string[]): string[] {
  return koGrapes.flatMap((ko) => {
    const mapped = grapeMap[ko];
    if (mapped) return mapped;
    if (/^[a-z]/.test(ko)) return [ko];
    return [ko];
  });
}

function grapesSame(naverRaw: string, vivinoRaw: string): boolean {
  const naverGrapes = normalizeGrape(naverRaw);
  const vivinoGrapes = normalizeGrape(vivinoRaw);
  const naverEn = translateGrapesKoToEn(naverGrapes);
  const naverInVivino = naverEn.every((ne) => vivinoGrapes.some((vg) => vg.includes(ne) || ne.includes(vg)));
  const vivinoInNaver = vivinoGrapes.every((vg) => naverEn.some((ne) => ne.includes(vg) || vg.includes(ne)));
  return naverInVivino && vivinoInNaver;
}

function regionSame(naverRaw: string, vivinoRaw: string): boolean {
  const vivinoLower = vivinoRaw.toLowerCase();
  const naverLower = naverRaw.toLowerCase().trim();
  if (vivinoLower.includes(naverLower) && naverLower.length > 2) return true;
  const mapped = regionMap[naverRaw.trim()];
  if (mapped) return mapped.some((en) => vivinoLower.includes(en));
  return false;
}

// 2번째 세그먼트가 지리적 대분류인 경우 스킵하고 3번째 사용
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
  // Paginated fetch
  let wines: any[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("wines")
      .select("id, name_ko, grape_variety, vivino_grapes, region, vivino_region")
      .not("vivino_page_url", "is", null)
      .range(from, from + pageSize - 1);
    if (error) { console.error(error); process.exit(1); }
    wines = wines.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  console.log(`대상 와인: ${wines.length}개\n`);

  // ── 포도품종 불일치 찾기 ──
  const grapeUpdates: { id: string; name_ko: string; old: string; new_val: string }[] = [];
  for (const w of wines) {
    if (!w.grape_variety || !w.vivino_grapes) continue;
    if (!grapesSame(w.grape_variety, w.vivino_grapes)) {
      grapeUpdates.push({ id: w.id, name_ko: w.name_ko, old: w.grape_variety, new_val: w.vivino_grapes });
    }
  }

  // ── 지역 불일치 찾기 ──
  const regionUpdates: { id: string; name_ko: string; old: string; new_val: string }[] = [];
  for (const w of wines) {
    if (!w.region || !w.vivino_region) continue;
    if (!regionSame(w.region, w.vivino_region)) {
      regionUpdates.push({ id: w.id, name_ko: w.name_ko, old: w.region, new_val: w.vivino_region });
    }
  }

  console.log(`포도품종 업데이트 대상: ${grapeUpdates.length}개`);
  console.log(`지역 업데이트 대상: ${regionUpdates.length}개`);

  const DRY_RUN = process.argv.includes("--dry-run");
  if (DRY_RUN) {
    console.log("\n[DRY RUN] 실제 업데이트하지 않고 미리보기만 출력합니다.\n");

    console.log("=== 포도품종 업데이트 미리보기 ===");
    for (const u of grapeUpdates) {
      console.log(`  ${u.name_ko}: "${u.old}" → "${u.new_val}"`);
    }

    console.log("\n=== 지역 업데이트 미리보기 ===");
    for (const u of regionUpdates) {
      const newRegion = extractRegion(u.new_val);
      console.log(`  ${u.name_ko}: "${u.old}" → "${newRegion}" (from: ${u.new_val})`);
    }
    return;
  }

  // ── 포도품종 업데이트 ──
  console.log(`\n=== 포도품종 업데이트 실행 ===`);
  let grapeSuccess = 0;
  let grapeFail = 0;
  for (const u of grapeUpdates) {
    const { error } = await supabase
      .from("wines")
      .update({ grape_variety: u.new_val, updated_at: new Date().toISOString() })
      .eq("id", u.id);
    if (error) {
      console.error(`  ✗ ${u.name_ko}: ${error.message}`);
      grapeFail++;
    } else {
      console.log(`  ✓ ${u.name_ko}: "${u.old}" → "${u.new_val}"`);
      grapeSuccess++;
    }
  }

  // ── 지역 업데이트 ──
  console.log(`\n=== 지역 업데이트 실행 ===`);
  let regionSuccess = 0;
  let regionFail = 0;
  for (const u of regionUpdates) {
    const newRegion = extractRegion(u.new_val);

    const { error } = await supabase
      .from("wines")
      .update({ region: newRegion, updated_at: new Date().toISOString() })
      .eq("id", u.id);
    if (error) {
      console.error(`  ✗ ${u.name_ko}: ${error.message}`);
      regionFail++;
    } else {
      console.log(`  ✓ ${u.name_ko}: "${u.old}" → "${newRegion}" (from: ${u.new_val})`);
      regionSuccess++;
    }
  }

  console.log(`\n=== 완료 ===`);
  console.log(`포도품종: ${grapeSuccess}개 성공, ${grapeFail}개 실패`);
  console.log(`지역: ${regionSuccess}개 성공, ${regionFail}개 실패`);
}

main().catch(console.error);
