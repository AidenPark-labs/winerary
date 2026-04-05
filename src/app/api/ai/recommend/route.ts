import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const client = new Anthropic();

const BASE_SYSTEM_PROMPT = `당신은 친절하고 전문적인 소믈리에입니다. 사용자에게 와인을 추천해주는 것이 역할입니다.

대화 방식:
- 상담하듯 자연스럽게 대화하세요. 한 번에 모든 것을 묻지 말고, 하나씩 물어보세요.
- 첫 인사 후 자연스럽게 어떤 자리인지(식사, 파티, 선물, 혼술 등) 물어보세요.
- 이후 순서대로: 선호하는 와인 색상(레드/화이트/로제/상관없음), 선호 품종이나 좋아하는 맛 스타일(예: 까베르네 소비뇽, 피노 누아 등 / 잘 모르면 가볍거나 묵직한 정도), 가격대, 준비한 음식이나 안주를 파악하세요.
- 이미 충분한 정보가 모이면 바로 추천해주세요. 불필요하게 질문을 늘리지 마세요.

추천 방식:
- 먼저 어떤 스타일/품종의 와인이 어울리는지 설명하세요 (예: "풀바디의 쉬라즈 계열 레드 와인을 추천드려요")
- 그 다음 아래 [한국 유통 와인 DB]에서 조건에 맞는 와인을 2~4개 골라 추천하세요
- DB에 있는 와인을 우선 추천하되, 적합한 와인이 없으면 한국에서 유통이 확실한 와인을 추천할 수 있습니다
- 각 와인에 대해: 이름, 실제 가격, 간단한 특징 (1~2문장)을 알려주세요
- 추천 후 "더 다른 스타일도 궁금하시면 말씀해주세요" 등 추가 대화를 유도하세요

가격대 준수 (매우 중요):
- 사용자가 특정 가격대를 언급하면 반드시 해당 범위 내의 와인만 추천하세요
- 예를 들어 "3만원대"라고 하면 3만원~3만9천원 범위의 와인만 추천하세요
- 각 와인의 가격을 반드시 함께 언급하세요 (예: "약 35,000원")
- [한국 유통 와인 DB]에 가격이 표시되어 있으니 이를 기준으로 하세요

와인 이름 표기 규칙 (반드시 지켜야 함):
- 구체적인 와인을 추천할 때, 와인 이름을 반드시 [[한국어|영어]] 형식으로 감싸세요.
- 예: [[옐로우 테일 쉬라즈|Yellow Tail Shiraz]], [[산타 리타 120 까베르네 소비뇽|Santa Rita 120 Cabernet Sauvignon]]
- ** (별표)나 다른 마크다운 문법을 절대 사용하지 마세요. 오직 [[]] 형식만 사용하세요.
- 형식: [[한국어 와인이름|영어 원본 와인이름]]
- 이 태그 바깥에 와인의 설명이나 가격 정보를 적으세요.

톤:
- 한국어로 대화하세요
- 친근하지만 전문적인 톤을 유지하세요
- 이모지는 적절히 사용하되 과하지 않게
- 답변은 너무 길지 않게, 모바일 채팅에 적합한 길이로
- 마크다운 문법(**, ##, 백틱 등)은 절대 사용하지 마세요. 일반 텍스트와 [[]] 태그만 사용하세요.`;

// ─── 대화에서 조건 추출 ──────────────────────────────────────────────────────

interface WineFilters {
  wineType: string | null;
  priceMin: number | null;
  priceMax: number | null;
  grape: string | null;
  country: string | null;
}

function extractFilters(messages: { role: string; content: string }[]): WineFilters {
  const userTexts = messages.filter((m) => m.role === "user").map((m) => m.content).join(" ");
  const filters: WineFilters = { wineType: null, priceMin: null, priceMax: null, grape: null, country: null };

  // 타입
  if (/레드/i.test(userTexts)) filters.wineType = "red";
  else if (/화이트/i.test(userTexts)) filters.wineType = "white";
  else if (/로제/i.test(userTexts)) filters.wineType = "rose";
  else if (/스파클링|샴페인|프로세코|까바/i.test(userTexts)) filters.wineType = "sparkling";

  // 가격
  const m1 = userTexts.match(/(\d+)\s*만\s*원\s*대/);
  if (m1) { const v = parseInt(m1[1]) * 10000; filters.priceMin = v; filters.priceMax = v + 9999; }
  const m2 = userTexts.match(/(\d+)\s*~\s*(\d+)\s*만\s*원/);
  if (m2) { filters.priceMin = parseInt(m2[1]) * 10000; filters.priceMax = parseInt(m2[2]) * 10000; }
  const m3 = userTexts.match(/(\d+)\s*만\s*원\s*이하/);
  if (m3) { filters.priceMin = 0; filters.priceMax = parseInt(m3[1]) * 10000; }
  const m4 = userTexts.match(/(\d+)\s*만\s*원\s*이상/);
  if (m4) { filters.priceMin = parseInt(m4[1]) * 10000; }

  // 품종
  const grapes: [RegExp, string][] = [
    [/까베르네\s*소비뇽|카베르네/i, "까베르네 소비뇽"], [/피노\s*누아/i, "피노 누아"],
    [/메를로/i, "메를로"], [/쉬라즈|시라/i, "쉬라즈"], [/말벡/i, "말벡"],
    [/샤르도네/i, "샤르도네"], [/소비뇽\s*블랑/i, "소비뇽 블랑"], [/리슬링/i, "리슬링"],
    [/템프라니요/i, "템프라니요"], [/산지오베제/i, "산지오베제"], [/네비올로/i, "네비올로"],
  ];
  for (const [re, name] of grapes) {
    if (re.test(userTexts)) { filters.grape = name; break; }
  }

  // 국가
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

async function queryWines(filters: WineFilters): Promise<string> {
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

// ─── API ─────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const { messages } = await request.json();
  if (!messages || !Array.isArray(messages)) {
    return Response.json({ error: "메시지가 필요합니다" }, { status: 400 });
  }

  try {
    // 대화에서 조건 추출 → DB 조회 → 시스템 프롬프트에 추가
    const filters = extractFilters(messages);
    const wineList = await queryWines(filters);
    const systemPrompt = BASE_SYSTEM_PROMPT + wineList;

    const stream = await client.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    console.error("[ai/recommend] error:", e);
    return Response.json({ error: "추천 중 오류가 발생했습니다" }, { status: 500 });
  }
}
