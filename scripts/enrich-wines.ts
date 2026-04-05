/**
 * 와인 DB 보강 스크립트
 * - description: Claude로 와인 설명 생성
 * - vivino_url: 영어 이름 기반 Vivino 검색 URL 생성
 *
 * 실행: npx tsx scripts/enrich-wines.ts
 */

import { config } from "dotenv";
import Anthropic from "@anthropic-ai/sdk";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anthropic = new Anthropic();

interface Wine {
  id: string;
  name_ko: string;
  name_en: string | null;
  wine_type: string | null;
  country: string | null;
  region: string | null;
  grape_variety: string | null;
  producer: string | null;
}

const headers = {
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

async function fetchWinesWithoutDescription(offset: number, limit: number): Promise<Wine[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/wines?select=id,name_ko,name_en,wine_type,country,region,grape_variety,producer&description=is.null&order=id&offset=${offset}&limit=${limit}`,
    { headers }
  );
  return res.json();
}

async function generateDescriptions(wines: Wine[]): Promise<Record<string, string>> {
  const prompt = `다음 와인 목록에 대해 각각 한국어로 1~2문장의 간결한 설명을 작성하세요.
설명에는 맛의 특징, 향, 바디감, 어울리는 음식 등을 포함하세요.
와인의 이름, 품종, 국가, 타입 정보를 기반으로 해당 와인의 일반적 특징을 설명하세요.

반드시 JSON 객체만 응답하세요. 키는 와인 ID, 값은 설명 문자열입니다.

와인 목록:
${wines.map((w) => `- ID: ${w.id} | ${w.name_ko} | ${w.name_en ?? ""} | 타입: ${w.wine_type ?? "?"} | 국가: ${w.country ?? "?"} | 품종: ${w.grape_variety ?? "?"} | 생산자: ${w.producer ?? "?"}`).join("\n")}`;

  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text = res.content[0].type === "text" ? res.content[0].text : "";
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return {};
    return JSON.parse(match[0]);
  } catch {
    console.error("  ⚠ JSON 파싱 실패");
    return {};
  }
}

async function updateWine(id: string, updates: Record<string, string | null>) {
  await fetch(`${SUPABASE_URL}/rest/v1/wines?id=eq.${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(updates),
  });
}

function buildVivinoUrl(nameEn: string | null): string | null {
  if (!nameEn) return null;
  return `https://www.vivino.com/search/wines?q=${encodeURIComponent(nameEn)}`;
}

async function main() {
  console.log("🍷 와인 DB 보강 시작\n");

  const BATCH = 15;
  let offset = 0;
  let total = 0;

  while (true) {
    const wines = await fetchWinesWithoutDescription(offset, BATCH);
    if (wines.length === 0) break;

    process.stdout.write(`[${offset + 1}~${offset + wines.length}] 설명 생성 중...`);

    // Claude로 설명 생성
    const descriptions = await generateDescriptions(wines);

    // 개별 업데이트
    let updated = 0;
    for (const wine of wines) {
      const desc = descriptions[wine.id];
      const vivinoUrl = buildVivinoUrl(wine.name_en);

      const updates: Record<string, string | null> = {};
      if (desc) updates.description = desc;
      if (vivinoUrl) updates.vivino_url = vivinoUrl;

      if (Object.keys(updates).length > 0) {
        await updateWine(wine.id, updates);
        updated++;
      }
    }

    console.log(` ✅ ${updated}개 업데이트`);
    total += updated;
    offset += BATCH;

    // API 호출 간격
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n🎉 완료! ${total}개 와인 정보 보강됨`);
}

main().catch(console.error);
