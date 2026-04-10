import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const client = new Anthropic();

// DB에서 와인 매칭 시도 — 정확 매칭 1건 또는 후보 리스트를 반환
async function matchFromDB(name: string, nameOriginal: string | null) {
  const supabase = await createClient();
  const seen = new Set<string>();
  const collected: any[] = [];
  const collect = (rows: any[] | null) => {
    if (!rows) return;
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      collected.push(r);
    }
  };

  // 1차: 영어 원본명 유사 매칭
  if (nameOriginal) {
    const { data } = await supabase
      .from("wines")
      .select("*")
      .ilike("name_en", `%${nameOriginal}%`)
      .limit(10);
    collect(data);
  }

  // 2차: 한국어명 유사 매칭
  if (name) {
    const { data } = await supabase
      .from("wines")
      .select("*")
      .ilike("name_ko", `%${name}%`)
      .limit(10);
    collect(data);
  }

  // 3차: 주요 키워드로 유사 검색 (앞 단계에서 결과가 부족할 때만)
  if (collected.length === 0 && nameOriginal) {
    const keywords = nameOriginal.split(/[\s\-]+/).filter((w) => w.length > 3).slice(0, 3);
    for (const keyword of keywords) {
      const { data } = await supabase
        .from("wines")
        .select("*")
        .or(`name_en.ilike.%${keyword}%,name_ko.ilike.%${keyword}%`)
        .limit(5);
      collect(data);
    }
  }

  if (collected.length === 0) return { exact: null, candidates: [] as any[] };
  if (collected.length === 1) return { exact: collected[0], candidates: [] as any[] };
  return { exact: null, candidates: collected.slice(0, 10) };
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

    // DB 매칭 시도 — 정확 1건 or 후보 리스트
    if (!result.error) {
      const { exact, candidates } = await matchFromDB(result.name, result.name_original);
      if (exact) {
        result.match_type = "exact";
        result.db_match = true;
        result.db_price = exact.price;
        result.wine_id = exact.id;
        if (exact.wine_type) result.wine_type = exact.wine_type;
        if (exact.country) result.country = exact.country;
        if (exact.grape_variety) result.grape_variety = exact.grape_variety;
        if (exact.producer) result.producer = exact.producer;
        if (exact.name_en && !result.name_original) result.name_original = exact.name_en;
      } else if (candidates.length > 0) {
        result.match_type = "candidates";
        result.candidates = candidates;
      } else {
        result.match_type = "none";
      }
    }

    return Response.json(result);
  } catch (e) {
    console.error("[ai/identify] error:", e);
    return Response.json({ error: "분석 중 오류가 발생했습니다" }, { status: 500 });
  }
}
