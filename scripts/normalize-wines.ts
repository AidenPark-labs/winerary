/**
 * 와인 DB 정규화 스크립트
 *
 * 1. 공백 차이 중복 병합 (피노 누아/피노누아 등)
 * 2. 시리즈 그룹 내 영문 철자 정규화 (AI 활용)
 * 3. 한국 유통명 레드↔Tinto 원본명 교정 (AI 활용)
 *
 * 실행: npx tsx scripts/normalize-wines.ts
 */

import { config } from "dotenv";
import Anthropic from "@anthropic-ai/sdk";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anthropic = new Anthropic();

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface Wine {
  id: string;
  name_ko: string;
  name_en: string | null;
  wine_type: string | null;
  country: string | null;
  grape_variety: string | null;
  producer: string | null;
  price: number | null;
  description: string | null;
  vivino_rating: number | null;
}

async function fetchAllWines(): Promise<Wine[]> {
  const all: Wine[] = [];
  let offset = 0;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/wines?select=id,name_ko,name_en,wine_type,country,grape_variety,producer,price,description,vivino_rating&order=name_ko&offset=${offset}&limit=1000`,
      { headers }
    );
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    offset += 1000;
  }
  return all;
}

async function deleteWine(id: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/wines?id=eq.${id}`, { method: "DELETE", headers });
}

async function updateWine(id: string, updates: Record<string, unknown>) {
  await fetch(`${SUPABASE_URL}/rest/v1/wines?id=eq.${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(updates),
  });
}

// ─── 1. 공백 차이 중복 병합 ─────────────────────────────────────────────────

async function mergeDuplicates(wines: Wine[]): Promise<number> {
  console.log("\n📋 1단계: 공백 차이 중복 병합\n");

  const byNormalized = new Map<string, Wine[]>();
  wines.forEach((w) => {
    const key = w.name_ko.replace(/\s/g, "");
    if (!byNormalized.has(key)) byNormalized.set(key, []);
    byNormalized.get(key)!.push(w);
  });

  let merged = 0;
  for (const [, group] of byNormalized) {
    if (group.length < 2) continue;

    // 가장 데이터가 풍부한 것을 keep (description, vivino_rating, price 기준)
    group.sort((a, b) => {
      const scoreA = (a.description ? 2 : 0) + (a.vivino_rating ? 2 : 0) + (a.price ? 1 : 0);
      const scoreB = (b.description ? 2 : 0) + (b.vivino_rating ? 2 : 0) + (b.price ? 1 : 0);
      return scoreB - scoreA;
    });

    const keep = group[0];
    const dupes = group.slice(1);

    for (const dupe of dupes) {
      // keep에 없는 데이터를 dupe에서 가져오기
      const updates: Record<string, unknown> = {};
      if (!keep.description && dupe.description) updates.description = dupe.description;
      if (!keep.vivino_rating && dupe.vivino_rating) updates.vivino_rating = dupe.vivino_rating;
      if (!keep.price && dupe.price) updates.price = dupe.price;
      if (!keep.producer && dupe.producer) updates.producer = dupe.producer;

      if (Object.keys(updates).length > 0) {
        await updateWine(keep.id, updates);
      }

      await deleteWine(dupe.id);
      console.log(`  🗑 "${dupe.name_ko}" 삭제 → "${keep.name_ko}" 유지`);
      merged++;
    }
  }

  console.log(`  ✅ ${merged}개 중복 삭제\n`);
  return merged;
}

// ─── 2. 시리즈 그룹 내 영문 철자 정규화 ──────────────────────────────────────

const TYPE_SUFFIXES = /\s+(레드|화이트|로제|틴토|블랑코|블랑|루즈|브뤼|스위트|Red|White|Rosé|Rose|Tinto|Blanco|Blanc|Rouge|Brut|Sweet)\s*$/i;
const GRAPE_SUFFIXES = /\s+(까베르네\s*소비뇽|카베르네|메를로|쉬라즈|시라|피노\s*누아|샤르도네|소비뇽\s*블랑|리슬링|말벡|템프라니요|산지오베제|모스카토|네비올로|피노\s*그리지오|피노누아|소비뇽블랑|까베르네소비뇽)\s*$/i;

function getBaseName(name: string) {
  return name.replace(TYPE_SUFFIXES, "").replace(GRAPE_SUFFIXES, "").trim();
}

async function normalizeGroupSpelling(wines: Wine[]): Promise<number> {
  console.log("📋 2단계: 시리즈 그룹 내 영문 철자 정규화\n");

  const groups = new Map<string, Wine[]>();
  wines.forEach((w) => {
    const base = getBaseName(w.name_ko);
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base)!.push(w);
  });

  // 영문명 불일치 그룹 찾기
  const inconsistent: { base: string; wines: Wine[] }[] = [];
  for (const [base, group] of groups) {
    if (group.length < 2) continue;
    const EN_SUFFIXES = /\s+(Cabernet Sauvignon|Merlot|Shiraz|Syrah|Pinot Noir|Chardonnay|Sauvignon Blanc|Riesling|Malbec|Tempranillo|Sangiovese|Moscato|Pinot Grigio|Nebbiolo|Grenache|Red|White|Rosé|Rose|Tinto|Blanco|Blanc|Rouge|Brut)\s*$/i;
    const enBases = group.map((w) => w.name_en?.replace(EN_SUFFIXES, "").trim()).filter(Boolean);
    const unique = [...new Set(enBases)];
    if (unique.length > 1) {
      inconsistent.push({ base, wines: group });
    }
  }

  if (inconsistent.length === 0) {
    console.log("  ✅ 불일치 없음\n");
    return 0;
  }

  // AI로 정규화
  const prompt = `다음 와인 시리즈 그룹들의 영문명이 불일치합니다. 각 그룹에서 정확한 영문 베이스명(브랜드/와이너리명)을 하나로 통일해주세요.

규칙:
- 각 그룹의 와인들은 같은 브랜드의 품종 변형입니다
- 정확한 영문 철자를 알려주세요 (가장 올바른 것 하나)
- 알 수 없으면 그룹에서 가장 합리적인 철자를 선택하세요

JSON 객체만 응답하세요. 키는 그룹 베이스명, 값은 정확한 영문 베이스명입니다.

${inconsistent.map((g) => {
    const variants = g.wines.map((w) => `  ${w.name_ko} → ${w.name_en}`).join("\n");
    return `[${g.base}]\n${variants}`;
  }).join("\n\n")}`;

  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text = res.content[0].type === "text" ? res.content[0].text : "";
  let corrections: Record<string, string> = {};
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) corrections = JSON.parse(match[0]);
  } catch {}

  let fixed = 0;
  for (const group of inconsistent) {
    const correctBase = corrections[group.base];
    if (!correctBase) continue;

    for (const wine of group.wines) {
      if (!wine.name_en) continue;
      // 품종/타입 접미사 보존하면서 베이스명만 교체
      const EN_SUFFIXES = /\s+(Cabernet Sauvignon|Merlot|Shiraz|Syrah|Pinot Noir|Chardonnay|Sauvignon Blanc|Riesling|Malbec|Tempranillo|Sangiovese|Moscato|Pinot Grigio|Nebbiolo|Grenache|Red|White|Rosé|Rose|Tinto|Blanco|Blanc|Rouge|Brut)\s*$/i;
      const suffixMatch = wine.name_en.match(EN_SUFFIXES);
      const suffix = suffixMatch ? suffixMatch[0] : "";
      const newNameEn = correctBase + suffix;

      if (newNameEn !== wine.name_en) {
        await updateWine(wine.id, { name_en: newNameEn });
        console.log(`  ✏️ "${wine.name_en}" → "${newNameEn}"`);
        fixed++;
      }
    }
  }

  console.log(`  ✅ ${fixed}개 영문명 정규화\n`);
  return fixed;
}

// ─── 3. 레드↔Tinto 원본명 교정 ──────────────────────────────────────────────

async function fixLocalizedNames(wines: Wine[]): Promise<number> {
  console.log("📋 3단계: 한국 유통명 ↔ 원본명 교정\n");

  // 한국어에 '레드'가 포함된 와인 중 스페인어/이탈리아어/프랑스어권
  const candidates = wines.filter((w) => {
    if (!w.name_en || !w.name_ko) return false;
    const ko = w.name_ko;
    const en = w.name_en.toLowerCase();
    return (
      (ko.includes("레드") && en.includes(" red")) ||
      (ko.includes("화이트") && en.includes(" white"))
    );
  });

  if (candidates.length === 0) {
    console.log("  ✅ 교정 대상 없음\n");
    return 0;
  }

  // AI로 원본명 확인 (배치)
  const BATCH = 25;
  let fixed = 0;

  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);

    const prompt = `다음 와인들의 영문명에서 "Red"나 "White"가 한국 유통명에서 번역된 것인지, 원본 이름 그대로인지 확인해주세요.

예를 들어:
- "Mucho Más Red" → 원본은 "Mucho Más Tinto" (스페인 와인이므로)
- "19 Crimes Red Blend" → 원본 그대로 "19 Crimes Red Blend" (호주 와인)

JSON 객체만 응답하세요. 키는 와인 ID, 값은 정확한 영문 원본명입니다. 변경 불필요하면 현재 이름 그대로 넣으세요.

${batch.map((w) => `- ID: ${w.id} | ${w.name_ko} → ${w.name_en} | 국가: ${w.country ?? "?"}`).join("\n")}`;

    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const text = res.content[0].type === "text" ? res.content[0].text : "";
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const corrections: Record<string, string> = JSON.parse(match[0]);
        for (const wine of batch) {
          const corrected = corrections[wine.id];
          if (corrected && corrected !== wine.name_en) {
            await updateWine(wine.id, { name_en: corrected });
            console.log(`  ✏️ "${wine.name_en}" → "${corrected}" (${wine.country})`);
            fixed++;
          }
        }
      }
    } catch {}

    await sleep(500);
  }

  console.log(`  ✅ ${fixed}개 원본명 교정\n`);
  return fixed;
}

// ─── 실행 ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🍷 와인 DB 정규화 시작\n");

  const wines = await fetchAllWines();
  console.log(`총 ${wines.length}개 와인 로드\n`);

  const merged = await mergeDuplicates(wines);

  // 중복 제거 후 다시 로드
  const refreshed = await fetchAllWines();

  const normalized = await normalizeGroupSpelling(refreshed);
  const corrected = await fixLocalizedNames(refreshed);

  console.log("🎉 정규화 완료!");
  console.log(`  중복 병합: ${merged}개`);
  console.log(`  영문 정규화: ${normalized}개`);
  console.log(`  원본명 교정: ${corrected}개`);
}

main().catch(console.error);
