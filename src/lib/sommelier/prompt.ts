import { createClient } from "@/lib/supabase/server";

// ─── 시스템 프롬프트 ─────────────────────────────────────────────────────────

export const SOMMELIER_SYSTEM_PROMPT = `당신은 친절하고 전문적인 소믈리에이자 미식 전문가입니다. 와인과 음식에 대해 종합적으로 상담해주는 것이 역할입니다.

역할:
- 와인 추천: 상황, 취향, 가격대에 맞는 와인을 추천
- 음식 추천: 와인에 어울리는 안주/음식을 추천하고, 필요하면 간단한 레시피도 제안
- 음식→와인 페어링: 먹을 음식에 맞는 와인 추천
- 와인→음식 페어링: 마실 와인에 맞는 음식/안주 추천
- 기록 분석: 사용자의 와인 기록을 분석하고 취향을 평가
- 와인/음식 지식: 품종, 산지, 양조, 보관, 재료, 조리법 등 교육적 질문에 답변

대화 방식:
- 상담하듯 자연스럽게 대화하세요. 한 번에 모든 것을 묻지 말고, 하나씩 물어보세요.
- 이미 충분한 정보가 모이면 바로 추천해주세요. 불필요하게 질문을 늘리지 마세요.
- 이전 대화 맥락을 기억하고 활용하세요. 사용자가 이전에 언급한 취향이나 상황을 참고하세요.

추천 방식:
- 먼저 어떤 스타일의 와인/음식이 어울리는지 설명하세요
- [한국 유통 와인 DB]에서 조건에 맞는 와인을 2~4개 골라 추천하세요
- DB에 있는 와인을 우선 추천하되, 적합한 와인이 없으면 한국에서 유통이 확실한 와인을 추천할 수 있습니다
- 각 와인에 대해: 이름, 실제 가격, 간단한 특징 (1~2문장)을 알려주세요
- 음식을 추천할 때는 간단한 레시피나 조리 팁도 함께 제안해주세요

색다른 추천 (간혹 자연스럽게):
- 사용자의 취향 프로필이나 기록이 있을 때, 가끔씩(3~4번 추천 중 1번 정도) 익숙한 추천과 함께 색다른 와인 1개를 추가로 제안하세요
- "평소 이런 스타일을 즐기셨는데, 혹시 색다르게 이런 건 어떠세요?" 같은 자연스러운 톤으로
- 색다른 추천의 원칙: 완전히 동떨어진 와인이 아니라, 익숙한 것에서 살짝 변주된 와인. 예시:
  - 같은 품종인데 다른 국가 (호주 쉬라즈 → 프랑스 시라)
  - 비슷한 바디감인데 다른 품종 (까베르네 소비뇽 → 말벡)
  - 같은 산지인데 다른 품종 (이탈리아 산지오베제 → 이탈리아 네비올로)
- 매번 하지 말고, 대화 흐름에서 자연스러울 때만 제안하세요

가격대 준수 (매우 중요):
- 사용자가 특정 가격대를 언급하면 반드시 해당 범위 내의 와인만 추천하세요
- 각 와인의 가격을 반드시 함께 언급하세요

와인 이름 표기 규칙 (반드시 지켜야 함):
- 구체적인 와인을 추천할 때, 와인 이름을 반드시 [[한국어|영어]] 형식으로 감싸세요.
- 예: [[옐로우 테일 쉬라즈|Yellow Tail Shiraz]]
- ** (별표)나 다른 마크다운 문법을 절대 사용하지 마세요. 오직 [[]] 형식만 사용하세요.

주제 범위 제한:
- 허용: 와인, 음식, 레시피, 페어링, 맛, 재료, 조리법, 와인 지식, 음식 지식
- 거절: 와인/음식과 무관한 질문은 정중하게 거절하고 와인·음식 관련 대화로 유도하세요
  예시: "저는 와인과 음식 전문 소믈리에라 그 부분은 도움드리기 어려워요. 대신 오늘 드실 와인이나 음식이 궁금하시면 편하게 물어봐주세요!"
- 절대 거절: 정치, 의료, 법률, 개인정보 등 민감한 주제

톤:
- 한국어로 대화하세요
- 친근하지만 전문적인 톤을 유지하세요
- 이모지는 적절히 사용하되 과하지 않게
- 답변은 너무 길지 않게, 모바일 채팅에 적합한 길이로
- 마크다운 문법(**, ##, 백틱 등)은 절대 사용하지 마세요. 일반 텍스트와 [[]] 태그만 사용하세요.`;

// ─── 대화에서 조건 추출 ──────────────────────────────────────────────────────

export interface WineFilters {
  wineType: string | null;
  priceMin: number | null;
  priceMax: number | null;
  grape: string | null;
  country: string | null;
}

export function extractFilters(messages: { role: string; content: string }[]): WineFilters {
  const userTexts = messages.filter((m) => m.role === "user").map((m) => m.content).join(" ");
  const filters: WineFilters = { wineType: null, priceMin: null, priceMax: null, grape: null, country: null };

  if (/레드/i.test(userTexts)) filters.wineType = "red";
  else if (/화이트/i.test(userTexts)) filters.wineType = "white";
  else if (/로제/i.test(userTexts)) filters.wineType = "rose";
  else if (/스파클링|샴페인|프로세코|까바/i.test(userTexts)) filters.wineType = "sparkling";

  const m1 = userTexts.match(/(\d+)\s*만\s*원\s*대/);
  if (m1) { const v = parseInt(m1[1]) * 10000; filters.priceMin = v; filters.priceMax = v + 9999; }
  const m2 = userTexts.match(/(\d+)\s*~\s*(\d+)\s*만\s*원/);
  if (m2) { filters.priceMin = parseInt(m2[1]) * 10000; filters.priceMax = parseInt(m2[2]) * 10000; }
  const m3 = userTexts.match(/(\d+)\s*만\s*원\s*이하/);
  if (m3) { filters.priceMin = 0; filters.priceMax = parseInt(m3[1]) * 10000; }
  const m4 = userTexts.match(/(\d+)\s*만\s*원\s*이상/);
  if (m4) { filters.priceMin = parseInt(m4[1]) * 10000; }

  const grapes: [RegExp, string][] = [
    [/까베르네\s*소비뇽|카베르네/i, "까베르네 소비뇽"], [/피노\s*누아/i, "피노 누아"],
    [/메를로/i, "메를로"], [/쉬라즈|시라/i, "쉬라즈"], [/말벡/i, "말벡"],
    [/샤르도네/i, "샤르도네"], [/소비뇽\s*블랑/i, "소비뇽 블랑"], [/리슬링/i, "리슬링"],
    [/템프라니요/i, "템프라니요"], [/산지오베제/i, "산지오베제"], [/네비올로/i, "네비올로"],
  ];
  for (const [re, name] of grapes) {
    if (re.test(userTexts)) { filters.grape = name; break; }
  }

  const countries: [RegExp, string][] = [
    [/프랑스/i, "프랑스"], [/이탈리아/i, "이탈리아"], [/스페인/i, "스페인"],
    [/칠레/i, "칠레"], [/호주/i, "호주"], [/미국/i, "미국"],
    [/아르헨티나/i, "아르헨티나"], [/독일/i, "독일"], [/뉴질랜드/i, "뉴질랜드"],
    [/포르투갈/i, "포르투갈"],
  ];
  for (const [re, name] of countries) {
    if (re.test(userTexts)) { filters.country = name; break; }
  }

  return filters;
}

// ─── DB에서 와인 조회 ────────────────────────────────────────────────────────

export async function queryWines(filters: WineFilters): Promise<string> {
  const supabase = await createClient();

  let query = supabase
    .from("wines")
    .select("name_ko, name_en, wine_type, country, grape_variety, producer, price")
    .not("price", "is", null);

  if (filters.wineType) query = query.eq("wine_type", filters.wineType);
  if (filters.priceMin != null) query = query.gte("price", filters.priceMin);
  if (filters.priceMax != null) query = query.lte("price", filters.priceMax);
  if (filters.grape) query = query.ilike("grape_variety", `%${filters.grape}%`);
  if (filters.country) query = query.eq("country", filters.country);

  query = query.order("price", { ascending: true }).limit(30);

  const { data } = await query;
  if (!data || data.length === 0) return "";

  const lines = data.map((w) => {
    const parts = [w.name_ko];
    if (w.name_en) parts.push(`(${w.name_en})`);
    parts.push(`${w.price?.toLocaleString()}원`);
    if (w.wine_type) parts.push(w.wine_type);
    if (w.country) parts.push(w.country);
    if (w.grape_variety) parts.push(w.grape_variety);
    if (w.producer) parts.push(w.producer);
    return `- ${parts.join(" | ")}`;
  });

  return `\n\n[한국 유통 와인 DB - ${data.length}개 검색됨]\n이 목록의 와인을 우선적으로 추천하세요. 가격은 실제 한국 판매가입니다.\n${lines.join("\n")}`;
}

// ─── 사용자 취향 프로필 (wine_records 기반) ──────────────────────────────────

export async function getUserPreferences(userId: string): Promise<string> {
  const supabase = await createClient();

  const { data: records } = await supabase
    .from("wine_records")
    .select("name, wine_type, grape_variety, wine_country, rating, price")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("rating", { ascending: false, nullsFirst: false })
    .limit(30);

  if (!records || records.length < 3) return "";

  const typeCounts: Record<string, number> = {};
  records.forEach((r) => { if (r.wine_type) typeCounts[r.wine_type] = (typeCounts[r.wine_type] ?? 0) + 1; });
  const topTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => t);

  const grapeCounts: Record<string, number> = {};
  records.forEach((r) => {
    if (r.grape_variety) r.grape_variety.split(/[,\/·&]+/).map((g: string) => g.trim()).filter(Boolean).forEach((g: string) => {
      grapeCounts[g] = (grapeCounts[g] ?? 0) + 1;
    });
  });
  const topGrapes = Object.entries(grapeCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);

  const countryCounts: Record<string, number> = {};
  records.forEach((r) => { if (r.wine_country) countryCounts[r.wine_country] = (countryCounts[r.wine_country] ?? 0) + 1; });
  const topCountries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);

  const prices = records.map((r) => r.price).filter((p): p is number => p != null && p > 0);
  const avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null;

  const topRated = records.filter((r) => r.rating != null && r.rating >= 4).slice(0, 5).map((r) => r.name);

  const parts: string[] = [];
  if (topTypes.length) parts.push(`선호 와인 타입: ${topTypes.join(", ")}`);
  if (topGrapes.length) parts.push(`선호 품종: ${topGrapes.join(", ")}`);
  if (topCountries.length) parts.push(`선호 국가: ${topCountries.join(", ")}`);
  if (avgPrice) parts.push(`평균 구매 가격: 약 ${avgPrice.toLocaleString()}원`);
  if (topRated.length) parts.push(`높은 평점 와인: ${topRated.join(", ")}`);

  if (parts.length === 0) return "";

  return `\n\n[사용자 와인 기록 분석 - ${records.length}개 기반]
이 사용자의 과거 와인 기록을 참고하여, 취향에 맞는 추천을 해주세요. 단, 사용자가 다른 조건을 명시하면 그것을 우선하세요.
${parts.join("\n")}`;
}

// ─── 위시리스트 조회 ─────────────────────────────────────────────────────────

export async function getUserWishlist(userId: string): Promise<string> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("wine_wishlist")
    .select("name_ko, name_en")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!data || data.length === 0) return "";

  const lines = data.map((w) => `- ${w.name_ko} (${w.name_en})`);
  return `\n\n[사용자 저장 와인 목록]\n${lines.join("\n")}`;
}

// ─── 전체 시스템 프롬프트 조립 ───────────────────────────────────────────────

export async function buildSystemPrompt(
  userId: string | null,
  recentMessages: { role: string; content: string }[],
  context?: { summary: string; taste_profile: string },
): Promise<string> {
  let prompt = SOMMELIER_SYSTEM_PROMPT;

  // 대화에서 추출한 취향 프로필 (sommelier_context)
  if (context?.taste_profile) {
    prompt += `\n\n[대화에서 파악된 사용자 취향]\n${context.taste_profile}`;
  }

  // 이전 대화 요약 (sommelier_context)
  if (context?.summary) {
    prompt += `\n\n[이전 대화 요약]\n${context.summary}`;
  }

  if (userId) {
    // 와인 DB 검색 + 사용자 취향 + 위시리스트 (병렬)
    const filters = extractFilters(recentMessages);
    const [wineList, userPrefs, wishlist] = await Promise.all([
      queryWines(filters),
      getUserPreferences(userId),
      getUserWishlist(userId),
    ]);
    prompt += wineList + userPrefs + wishlist;
  } else {
    // 비로그인: 와인 DB만 검색
    const filters = extractFilters(recentMessages);
    const wineList = await queryWines(filters);
    prompt += wineList;
  }

  return prompt;
}
