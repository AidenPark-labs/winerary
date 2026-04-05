import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const client = new Anthropic();

// DB에서 와인 매칭 시도
async function matchFromDB(name: string, nameOriginal: string | null) {
  const supabase = await createClient();

  // 1차: 영어 원본명으로 정확 매칭
  if (nameOriginal) {
    const { data } = await supabase
      .from("wines")
      .select("*")
      .ilike("name_en", `%${nameOriginal}%`)
      .limit(1)
      .single();
    if (data) return data;
  }

  // 2차: 한국어명으로 매칭
  if (name) {
    const { data } = await supabase
      .from("wines")
      .select("*")
      .ilike("name_ko", `%${name}%`)
      .limit(1)
      .single();
    if (data) return data;
  }

  // 3차: 원본명의 주요 키워드로 유사 검색
  if (nameOriginal) {
    const keywords = nameOriginal.split(/[\s\-]+/).filter((w) => w.length > 3).slice(0, 3);
    for (const keyword of keywords) {
      const { data } = await supabase
        .from("wines")
        .select("*")
        .or(`name_en.ilike.%${keyword}%,name_ko.ilike.%${keyword}%`)
        .limit(5);
      if (data && data.length === 1) return data[0];
    }
  }

  return null;
}

export async function POST(request: Request) {

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "이미지가 없습니다" }, { status: 400 });

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mediaType = (file.type || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "image/gif";

  const prompt = `이 사진에서 와인병이나 와인 라벨을 찾아 텍스트를 읽고, 와인 이름을 추출하세요.

라벨 인식 우선순위:
1. 사진에 여러 물체가 있더라도 와인병/와인 라벨에 집중하세요
2. 라벨에 적힌 와인 이름, 생산자, 빈티지, 지역명을 우선적으로 읽으세요
3. 배경, 테이블, 음식, 사람 등 와인이 아닌 요소는 무시하세요
4. 라벨이 일부만 보이더라도 읽을 수 있는 텍스트로 와인을 식별하세요

와인 라벨이 없거나 와인이 아닌 경우 {"error": "와인 라벨을 인식하지 못했습니다"} 만 반환하세요.

라벨에서 와인 이름을 추출한 뒤, 해당 와인에 대해 알고 있는 지식을 바탕으로 정보를 작성하세요.
description과 food_pairing은 사진이 아닌, 해당 와인 자체의 알려진 특징을 기반으로 작성하세요.

아래 JSON 형식으로만 응답하세요. 설명 없이 JSON만 출력하세요:
{
  "name": "와인 한국어 이름 (없으면 원본명)",
  "name_original": "라벨의 원본 와인명 (영어/현지어)",
  "producer": "생산자 또는 와이너리",
  "country": "생산 국가 (한국어)",
  "region": "생산 지역 (없으면 null)",
  "wine_type": "red/white/rose/sparkling/fortified/other 중 하나",
  "grape_variety": "포도 품종 (한국어, 모르면 null)",
  "vintage": 숫자 연도 또는 null,
  "vivino_url": "https://www.vivino.com/search/wines?q=URL인코딩된원본와인명",
  "description": "이 와인의 알려진 특징 (맛, 향, 바디감 등)을 2~3문장으로 설명",
  "food_pairing": "이 와인과 잘 어울리는 음식 3~4가지를 간략히 (예: '소고기 스테이크, 양갈비, 숙성 치즈')"
}`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    });

    const block = response.content.find((b) => b.type === "text");
    const text = block?.type === "text" ? block.text : "";
    console.log("[ai/identify] raw:", text.slice(0, 300));

    const jsonMatch =
      text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ||
      text.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) return Response.json({ error: "분석 결과를 파싱할 수 없습니다" }, { status: 500 });

    const result = JSON.parse(jsonMatch[1] ?? jsonMatch[0]);

    // DB 매칭 시도 — 성공하면 정확한 가격/정보로 보강
    if (!result.error) {
      const dbWine = await matchFromDB(result.name, result.name_original);
      if (dbWine) {
        result.db_match = true;
        result.db_price = dbWine.price;
        if (dbWine.wine_type) result.wine_type = dbWine.wine_type;
        if (dbWine.country) result.country = dbWine.country;
        if (dbWine.grape_variety) result.grape_variety = dbWine.grape_variety;
        if (dbWine.producer) result.producer = dbWine.producer;
        if (dbWine.name_en && !result.name_original) result.name_original = dbWine.name_en;
      }
    }

    return Response.json(result);
  } catch (e) {
    console.error("[ai/identify] error:", e);
    return Response.json({ error: "분석 중 오류가 발생했습니다" }, { status: 500 });
  }
}
