/**
 * 단건 raw_wine → wines_v2 승격 로직 (v5).
 *
 * v3 코드를 변환 모듈(wines-v2-transform.ts)에 통합 — buildVivinoFields/autoMerge fillEmpty 등은
 * 모두 모듈 안으로 이동. 이 파일에는 dedupe 매칭(buildMatchKey/classifyCandidate)과 raw → input 어댑터만 남김.
 *
 * Phase 5 swap 후 wines_v2 → wines로 sed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalize,
  stripVintage,
  buildMatchKey,
  classifyCandidate,
  type MatchReason,
} from "./wine-dedupe";
import {
  loadTermDict,
  transformInput,
  buildUpdatePatch,
  type WinesV2Input,
  type VivinoInput,
} from "./wines-v2-transform";

// ─── grape 추출 (정책: wine21만 parsed_grape 검증, 나머지 raw.grape_variety 분해) ─────

const GRAPE_KEYWORDS: Record<string, string[]> = {
  "Cabernet Sauvignon": ["cabernet sauvignon", "cab sauv", "cabernet-sauvignon"],
  "Cabernet Franc": ["cabernet franc"],
  Merlot: ["merlot"],
  "Pinot Noir": ["pinot noir", "pinot nero", "spatburgunder"],
  "Pinot Grigio": ["pinot grigio", "pinot gris"],
  "Pinot Blanc": ["pinot blanc", "pinot bianco", "weissburgunder"],
  Chardonnay: ["chardonnay"],
  "Sauvignon Blanc": ["sauvignon blanc", "sauv blanc"],
  Riesling: ["riesling"],
  Syrah: ["syrah", "shiraz"],
  Grenache: ["grenache", "garnacha"],
  Tempranillo: ["tempranillo"],
  Sangiovese: ["sangiovese"],
  Nebbiolo: ["nebbiolo", "barolo", "barbaresco"],
  Malbec: ["malbec"],
  Zinfandel: ["zinfandel", "primitivo"],
  Gewurztraminer: ["gewurz", "gewürz"],
  Viognier: ["viognier"],
  "Chenin Blanc": ["chenin"],
  Semillon: ["semillon", "sémillon"],
  Gamay: ["gamay"],
  "Carménère": ["carmenere", "carménère"],
  "Mourvèdre": ["mourvedre", "mourvèdre", "monastrell"],
  "Petit Verdot": ["petit verdot"],
  Torrontes: ["torrontes", "torrontés"],
  "Albariño": ["albarino", "albariño"],
  Verdejo: ["verdejo"],
  Vermentino: ["vermentino"],
  Prosecco: ["prosecco", "glera"],
  Champagne: ["champagne"],
  Barbera: ["barbera"],
  Dolcetto: ["dolcetto"],
  Fiano: ["fiano"],
};

function grapeInName(grape: string, nameLower: string): boolean {
  const keys = GRAPE_KEYWORDS[grape];
  if (keys) return keys.some((k) => nameLower.includes(k));
  return nameLower.includes(grape.toLowerCase());
}

export interface RawWineInput {
  id: string;
  source: string;
  name_ko: string | null;
  name_en: string | null;
  country: string | null;
  region: string | null;
  wine_type: string | null;
  grape_variety: string | null;
  producer_ko: string | null;
  producer_en: string | null;
  image_url: string | null;
  alcohol: string | null;
  price: number | null;
  raw_payload: Record<string, unknown> | null;
  promoted_wine_id: string | null;
}

export function extractGrapes(raw: RawWineInput): string[] {
  if (raw.source === "wine21") {
    const p = raw.raw_payload;
    const pgv = p && Array.isArray(p.parsed_grape_varieties) ? (p.parsed_grape_varieties as string[]) : [];
    if (pgv.length === 0 || !raw.name_en) return [];
    const nameLower = raw.name_en.toLowerCase();
    const allIn = pgv.every((g) => grapeInName(g, nameLower));
    if (!allIn) return [];
    return pgv;
  }
  const gv = raw.grape_variety;
  if (!gv || typeof gv !== "string") return [];
  return gv.split(/[,;/]/).map((s) => s.trim()).filter((s) => s.length > 0);
}

// ─── raw → WinesV2Input 어댑터 ────────────────────────────────────────────────

const VALID_SOURCES = new Set([
  "wine21",
  "winenara",
  "gangnam",
  "naver_shopping",
  "user_submission",
  "admin",
]);

function buildVivinoFromRawPayload(p: Record<string, unknown> | null | undefined): VivinoInput | null {
  if (!p) return null;
  const url = typeof p.vivino_url === "string" ? p.vivino_url : null;
  if (!url) return null;
  return {
    url,
    wine_id: typeof p.vivino_wine_id === "number" || typeof p.vivino_wine_id === "string" ? p.vivino_wine_id : null,
    name: typeof p.vivino_name === "string" ? p.vivino_name : null,
    rating: typeof p.vivino_rating === "number" ? p.vivino_rating : null,
    reviews: typeof p.vivino_reviews === "number" ? p.vivino_reviews : null,
    winery: typeof p.vivino_winery === "string" ? p.vivino_winery : null,
    grapes: typeof p.vivino_grapes === "string" ? p.vivino_grapes : null,
    region: typeof p.vivino_region === "string" ? p.vivino_region : null,
    style: typeof p.vivino_style === "string" ? p.vivino_style : null,
    alcohol: typeof p.vivino_alcohol === "string" ? p.vivino_alcohol : null,
    description: typeof p.vivino_description === "string" ? p.vivino_description : null,
    allergens: typeof p.vivino_allergens === "string" ? p.vivino_allergens : null,
    image_url: typeof p.vivino_image_url === "string" ? p.vivino_image_url : null,
    match_score: typeof p.vivino_match_score === "number" ? p.vivino_match_score : null,
    scraped_at: typeof p.vivino_scraped_at === "string" ? p.vivino_scraped_at : null,
  };
}

function rawToInput(raw: RawWineInput, grapes: string[]): WinesV2Input {
  const source = VALID_SOURCES.has(raw.source) ? raw.source : "admin";
  return {
    source: source as WinesV2Input["source"],
    source_refs: [raw.id],
    name_ko: stripVintage(raw.name_ko ?? "") || (raw.name_ko ?? ""),
    name_en: stripVintage(raw.name_en ?? "") || (raw.name_en ?? ""),
    country: raw.country ?? "",
    region: raw.region,
    wine_type: raw.wine_type,
    producer: raw.producer_en ?? raw.producer_ko ?? null,
    grape_varieties: grapes,
    alcohol: raw.alcohol,
    price: raw.price,
    image_url: raw.image_url,
    is_published: true,
    vivino: buildVivinoFromRawPayload(raw.raw_payload),
    legacy: {
      raw_payload: raw.raw_payload ?? undefined,
      review_image_url: typeof (raw.raw_payload as Record<string, unknown> | null)?.image_path === "string"
        ? buildReviewImageUrl(raw)
        : undefined,
    },
  };
}

function buildReviewImageUrl(raw: RawWineInput): string | undefined {
  const p = (raw.raw_payload ?? {}) as Record<string, unknown>;
  if (raw.source === "wine21") {
    const path = p.image_path as string | undefined;
    if (path && !/no_image/i.test(path)) return `https://img.wine21.com${path}`;
  }
  return undefined;
}

export function validateRequired(raw: RawWineInput, grapes: string[]): string[] {
  const missing: string[] = [];
  if (!raw.name_ko?.trim()) missing.push("name_ko");
  if (!raw.name_en?.trim()) missing.push("name_en");
  if (!raw.country?.trim()) missing.push("country");
  if (grapes.length === 0) missing.push("grape");
  return missing;
}

// ─── promote outcome ──────────────────────────────────────────────────────────

export type PromoteOutcome =
  | { kind: "already_promoted"; wine_id: string }
  | { kind: "missing_fields"; missing: string[] }
  | { kind: "auto_merged"; wine_id: string }
  | { kind: "new_promoted"; wine_id: string }
  | { kind: "candidate"; wine_id: string; reason: MatchReason; score: number }
  | { kind: "error"; message: string };

// ─── 메인 — promote 단건 ──────────────────────────────────────────────────────

export async function promoteSingleRawWine(
  sb: SupabaseClient,
  raw: RawWineInput,
): Promise<PromoteOutcome> {
  if (raw.promoted_wine_id) {
    return { kind: "already_promoted", wine_id: raw.promoted_wine_id };
  }

  const grapes = extractGrapes(raw);
  const missing = validateRequired(raw, grapes);
  if (missing.length > 0) return { kind: "missing_fields", missing };

  const key = buildMatchKey({ name_en: raw.name_en, name_ko: raw.name_ko, country: raw.country });
  const now = new Date().toISOString();
  const dict = await loadTermDict(sb);

  // 1) exact match 후보 조회
  const { data: exactCands } = await sb
    .from("wines_v2")
    .select("id, name_ko, name_en, country_ko")
    .eq("name_ko", (raw.name_ko ?? "").trim())
    .limit(50);

  for (const w of exactCands ?? []) {
    const wk = buildMatchKey({ name_en: w.name_en, name_ko: w.name_ko, country: w.country_ko });
    if (wk.name_en_n === key.name_en_n && wk.name_ko_n === key.name_ko_n && wk.country === key.country) {
      const ok = await autoMergeV2(sb, raw, w.id, grapes, dict, now);
      return ok ? { kind: "auto_merged", wine_id: w.id } : { kind: "error", message: "merge 실패" };
    }
  }

  // 2) 부분 일치 후보 → wine_dedupe_candidates 등록
  const { data: partialCands } = await sb
    .from("wines_v2")
    .select("id, name_ko, name_en, country_ko")
    .or(`name_ko.eq.${(raw.name_ko ?? "").trim()},name_en.eq.${(raw.name_en ?? "").trim()}`)
    .limit(50);

  let best: { reason: MatchReason; score: number; target: string } | null = null;
  for (const w of partialCands ?? []) {
    const wk = buildMatchKey({ name_en: w.name_en, name_ko: w.name_ko, country: w.country_ko });
    const c = classifyCandidate(key, wk);
    if (c && (!best || c.score > best.score)) {
      best = { reason: c.reason, score: c.score, target: w.id };
    }
  }
  if (best) {
    const { error } = await sb.from("wine_dedupe_candidates").insert({
      raw_wine_id: raw.id,
      target_wine_id: best.target,
      match_reason: best.reason,
      match_score: best.score,
      status: "pending",
    });
    if (error && error.code !== "23505") {
      return { kind: "error", message: `candidate 등록 실패: ${error.message}` };
    }
    return { kind: "candidate", wine_id: best.target, reason: best.reason, score: best.score };
  }

  // 3) 신규 INSERT — 변환 모듈 통과
  const result = await transformInput(sb, rawToInput(raw, grapes), dict);
  if (!result.ok) return { kind: "error", message: result.error };

  const { randomUUID } = await import("crypto");
  const newId = randomUUID();
  const { error } = await sb.from("wines_v2").insert({
    id: newId,
    ...result.wineRow,
    created_at: now,
    updated_at: now,
  });
  if (error) {
    if (error.code === "23505" && error.message.includes("name_ko")) {
      // 중복 → 같은 name_ko 가진 wines_v2를 찾아 candidate 등록 시도
      const { data: collide } = await sb
        .from("wines_v2")
        .select("id")
        .eq("name_ko", result.wineRow.name_ko)
        .limit(1);
      const target = collide?.[0]?.id;
      if (target) {
        await sb.from("wine_dedupe_candidates").insert({
          raw_wine_id: raw.id,
          target_wine_id: target,
          match_reason: "name_en_variant",
          match_score: 0.5,
          status: "pending",
        });
        return { kind: "candidate", wine_id: target, reason: "name_en_variant", score: 0.5 };
      }
    }
    return { kind: "error", message: error.message };
  }

  // vivino_wines 별도 INSERT
  if (result.vivinoRow) {
    await sb.from("vivino_wines").insert({ wine_id: newId, ...result.vivinoRow });
  }

  await sb
    .from("raw_wines")
    .update({ promoted_wine_id: newId, promoted_at: now })
    .eq("id", raw.id);

  return { kind: "new_promoted", wine_id: newId };
}

async function autoMergeV2(
  sb: SupabaseClient,
  raw: RawWineInput,
  targetId: string,
  grapes: string[],
  dict: Awaited<ReturnType<typeof loadTermDict>>,
  now: string,
): Promise<boolean> {
  // 현재 wines_v2 행 조회
  const { data: target } = await sb
    .from("wines_v2")
    .select(
      "name_ko, name_en, wine_type, wine_style, country_ko, region_ko, producer, grape_varieties, grape_blend, alcohol, brand, price, description, image_url, locked_fields, source_refs, source_snapshot",
    )
    .eq("id", targetId)
    .maybeSingle();
  if (!target) return false;

  const result = await buildUpdatePatch(sb, target as any, rawToInput(raw, grapes), {
    dict,
    fillEmptyOnly: true,
  });

  // wines_v2 UPDATE
  const update = { ...result.wineUpdate, updated_at: now };
  if (Object.keys(update).length > 1) {
    const upd = await sb.from("wines_v2").update(update).eq("id", targetId);
    if (upd.error) return false;
  }

  // vivino_wines 처리 (있고 wine_id에 없으면 INSERT, 있으면 빈 필드 채움)
  if (result.vivinoUpsert) {
    const { data: existingVivino } = await sb
      .from("vivino_wines")
      .select("wine_id")
      .eq("wine_id", targetId)
      .maybeSingle();
    if (!existingVivino) {
      await sb.from("vivino_wines").insert({ wine_id: targetId, ...result.vivinoUpsert });
    }
  }

  const rawUpd = await sb
    .from("raw_wines")
    .update({ promoted_wine_id: targetId, promoted_at: now })
    .eq("id", raw.id);
  return !rawUpd.error;
}

export { normalize };

// ─── 어드민 직접 INSERT ────────────────────────────────────────────────────────

export interface WineCreateInput {
  name_ko: string | null;
  name_en: string | null;
  country: string | null;
  country_ko?: string | null; // 무시 (변환 모듈이 자동 처리)
  region?: string | null;
  region_ko?: string | null;
  wine_type?: string | null;
  grape_variety?: string | null;
  grape_varieties?: string[] | null;
  producer_ko?: string | null;
  producer_en?: string | null;
  image_url?: string | null;
  price?: number | null;
  data_source?: string;
  // Vivino 직접 입력
  vivino_url?: string | null;
  vivino_wine_id?: string | number | null;
  vivino_rating?: number | null;
  vivino_reviews?: number | null;
  vivino_winery?: string | null;
  vivino_grapes?: string | null;
  vivino_region?: string | null;
  vivino_style?: string | null;
  vivino_alcohol?: string | null;
  vivino_description?: string | null;
  vivino_allergens?: string | null;
  vivino_name?: string | null;
  vivino_match_score?: number | null;
}

export type InsertWineOutcome =
  | { kind: "new_inserted"; wine_id: string }
  | { kind: "auto_merged"; wine_id: string }
  | { kind: "candidate"; wine_id: string; reason: MatchReason; score: number }
  | { kind: "missing_fields"; missing: string[] }
  | { kind: "error"; message: string };

function collectGrapes(input: WineCreateInput): string[] {
  if (Array.isArray(input.grape_varieties) && input.grape_varieties.length > 0) {
    return input.grape_varieties.map((s) => s.trim()).filter((s) => s.length > 0);
  }
  if (typeof input.grape_variety === "string" && input.grape_variety.trim()) {
    return input.grape_variety.split(/[,;/]/).map((s) => s.trim()).filter((s) => s.length > 0);
  }
  return [];
}

function buildVivinoFromCreateInput(input: WineCreateInput): VivinoInput | null {
  if (!input.vivino_url) return null;
  return {
    url: input.vivino_url,
    wine_id: input.vivino_wine_id ?? null,
    name: input.vivino_name ?? null,
    rating: input.vivino_rating ?? null,
    reviews: input.vivino_reviews ?? null,
    winery: input.vivino_winery ?? null,
    grapes: input.vivino_grapes ?? null,
    region: input.vivino_region ?? null,
    style: input.vivino_style ?? null,
    alcohol: input.vivino_alcohol ?? null,
    description: input.vivino_description ?? null,
    allergens: input.vivino_allergens ?? null,
    match_score: input.vivino_match_score ?? null,
  };
}

export async function insertWineDirectly(
  sb: SupabaseClient,
  input: WineCreateInput,
): Promise<InsertWineOutcome> {
  const grapes = collectGrapes(input);
  const missing: string[] = [];
  if (!input.name_ko?.trim()) missing.push("name_ko");
  if (!input.name_en?.trim()) missing.push("name_en");
  if (!input.country?.trim()) missing.push("country");
  if (grapes.length === 0) missing.push("grape");
  if (missing.length > 0) return { kind: "missing_fields", missing };

  const dict = await loadTermDict(sb);
  const nameKo = stripVintage(input.name_ko ?? "") || (input.name_ko ?? "");
  const nameEn = stripVintage(input.name_en ?? "") || (input.name_en ?? "");

  const key = buildMatchKey({ name_en: nameEn, name_ko: nameKo, country: input.country });
  const now = new Date().toISOString();

  // 1) exact match → auto_merge
  const { data: exactCands } = await sb
    .from("wines_v2")
    .select("id, name_ko, name_en, country_ko, grape_varieties, source_refs")
    .eq("name_ko", (nameKo ?? "").trim())
    .limit(50);

  for (const w of exactCands ?? []) {
    const wk = buildMatchKey({ name_en: w.name_en, name_ko: w.name_ko, country: w.country_ko });
    if (wk.name_en_n === key.name_en_n && wk.name_ko_n === key.name_ko_n && wk.country === key.country) {
      const updates: Record<string, unknown> = { updated_at: now };
      const existingGrapes = Array.isArray(w.grape_varieties) ? (w.grape_varieties as string[]) : [];
      const merged = Array.from(new Set([...existingGrapes, ...grapes]));
      if (merged.length > existingGrapes.length) {
        // 변환 모듈로 정규화
        const r = await buildUpdatePatch(sb, w as any, { grape_varieties: merged }, { dict });
        Object.assign(updates, r.wineUpdate);
      }
      await sb.from("wines_v2").update(updates).eq("id", w.id);
      return { kind: "auto_merged", wine_id: w.id };
    }
  }

  // 2) 신규 INSERT
  const result = await transformInput(
    sb,
    {
      source: (input.data_source as WinesV2Input["source"]) ?? "admin",
      name_ko: nameKo,
      name_en: nameEn,
      country: input.country ?? "",
      region: input.region ?? input.region_ko ?? null,
      wine_type: input.wine_type,
      producer: input.producer_en ?? input.producer_ko ?? null,
      grape_varieties: grapes,
      price: input.price,
      image_url: input.image_url,
      vivino: buildVivinoFromCreateInput(input),
    },
    dict,
  );
  if (!result.ok) return { kind: "error", message: result.error };

  const { randomUUID } = await import("crypto");
  const newId = randomUUID();
  const { error } = await sb.from("wines_v2").insert({
    id: newId,
    ...result.wineRow,
    created_at: now,
    updated_at: now,
  });
  if (error) {
    if (error.code === "23505" && error.message.includes("name_ko")) {
      const { data: collide } = await sb
        .from("wines_v2")
        .select("id, grape_varieties")
        .eq("name_ko", result.wineRow.name_ko)
        .limit(1);
      const target = collide?.[0];
      if (target) {
        const existingGrapes = Array.isArray(target.grape_varieties) ? (target.grape_varieties as string[]) : [];
        const merged = Array.from(new Set([...existingGrapes, ...grapes]));
        if (merged.length > existingGrapes.length) {
          await sb.from("wines_v2").update({ grape_varieties: merged, updated_at: now }).eq("id", target.id);
        }
        return { kind: "auto_merged", wine_id: target.id };
      }
    }
    return { kind: "error", message: error.message };
  }

  if (result.vivinoRow) {
    await sb.from("vivino_wines").insert({ wine_id: newId, ...result.vivinoRow });
  }

  return { kind: "new_inserted", wine_id: newId };
}
