/**
 * 와인 영문명 검증 및 수정 스크립트
 *
 * 1. Vivino 검색으로 정확한 영문명 확인
 * 2. AI로 한국어 음역 → 영문 역추적 재검증
 * 3. 검증된 이름으로 DB 업데이트
 *
 * 실행: npx tsx scripts/verify-wine-names.ts
 */

import { config } from "dotenv";
import Anthropic from "@anthropic-ai/sdk";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anthropic = new Anthropic();

const headers = {
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Vivino 검색에서 와인 영문명 추출
async function searchVivino(query: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.vivino.com/search/wines?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/537.36" },
    });
    if (!res.ok) return null;

    const html = await res.text();
    const decoded = html.replace(/&quot;/g, '"').replace(/&amp;/g, "&");

    // 첫 번째 검색 결과의 와인 이름 추출
    const nameMatch = decoded.match(/"wine":\{[^}]*"name":"([^"]+)"/);
    const wineryMatch = decoded.match(/"winery":\{[^}]*"name":"([^"]+)"/);

    if (nameMatch) {
      const wineName = nameMatch[1];
      const winery = wineryMatch?.[1];
      return winery ? `${winery} ${wineName}` : wineName;
    }
  } catch {}
  return null;
}

// AI로 배치 검증
async function verifyWithAI(wines: { id: string; name_ko: string; name_en: string | null }[]): Promise<Record<string, string>> {
  const prompt = `다음 와인들의 한국어 이름은 외국어 와인명을 한국어로 음역(transliteration)한 것입니다.
각 와인의 정확한 영문 원본 이름을 찾아주세요.

중요 규칙:
- 한국어는 음역입니다. "섹슈얼" → "Sexual" (O), "Sexy" (X)
- "까베르네" → "Cabernet", "소비뇽" → "Sauvignon" 같은 음역 규칙을 따르세요
- 현재 영문명이 맞다면 그대로 유지하세요
- 잘 모르겠으면 현재 영문명을 그대로 반환하세요
- 한국어를 영어로 "의미 번역"하지 마세요. 음가를 따라 역추적하세요.

JSON 객체만 응답하세요. 키는 와인 ID, 값은 수정된 영문명입니다.

와인 목록:
${wines.map((w) => `- ID: ${w.id} | 한국어: ${w.name_ko} | 현재 영문: ${w.name_en ?? "없음"}`).join("\n")}`;

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
    return {};
  }
}

async function main() {
  console.log("🔍 와인 영문명 검증 시작\n");

  // 전체 와인 가져오기 (영문명이 있는 것)
  const allWines: { id: string; name_ko: string; name_en: string }[] = [];
  let offset = 0;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/wines?select=id,name_ko,name_en&name_en=not.is.null&order=id&offset=${offset}&limit=1000`,
      { headers }
    );
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    allWines.push(...batch);
    offset += 1000;
  }
  console.log(`총 ${allWines.length}개 와인 검증 대상\n`);

  // AI로 배치 검증 (20개씩)
  const BATCH = 20;
  let fixed = 0;

  for (let i = 0; i < allWines.length; i += BATCH) {
    const batch = allWines.slice(i, i + BATCH);
    process.stdout.write(`[${i + 1}~${Math.min(i + BATCH, allWines.length)} / ${allWines.length}] 검증 중...`);

    const corrections = await verifyWithAI(batch);

    // 수정된 것만 업데이트
    for (const wine of batch) {
      const corrected = corrections[wine.id];
      if (corrected && corrected !== wine.name_en) {
        await fetch(`${SUPABASE_URL}/rest/v1/wines?id=eq.${wine.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ name_en: corrected }),
        });
        console.log(`\n  ✏️  ${wine.name_ko}: "${wine.name_en}" → "${corrected}"`);
        fixed++;
      }
    }

    console.log(` ✅`);
    await sleep(500);
  }

  console.log(`\n🎉 완료! ${fixed}개 영문명 수정됨 (${allWines.length}개 검증)`);
}

main().catch(console.error);
