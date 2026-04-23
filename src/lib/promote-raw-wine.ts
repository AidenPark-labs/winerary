/**
 * 단건 raw_wine → wines 승격 로직 (scripts/promote-v2.ts의 서브셋)
 *
 * 서버 액션에서 어드민이 "지금 승격" 버튼을 누를 때 사용.
 * 일괄 promote와 동일한 정책이지만:
 *   - wines 전체 인덱스를 매번 로드하지 않고 DB 쿼리로 매칭
 *   - pending_wines 재연결은 여기서 안 함 (별도 일괄 잡)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalize,
  stripVintage,
  buildMatchKey,
  classifyCandidate,
  type MatchReason,
} from "./wine-dedupe";

const VALID_WINE_TYPES = new Set(["red", "white", "rose", "sparkling", "fortified", "dessert", "other"]);

function normalizeWineType(raw: string | null | undefined): string {
  const v = (raw ?? "").toLowerCase().trim();
  if (VALID_WINE_TYPES.has(v)) return v;
  return "other";
}

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

export function validateRequired(raw: RawWineInput, grapes: string[]): string[] {
  const missing: string[] = [];
  if (!raw.name_ko?.trim()) missing.push("name_ko");
  if (!raw.name_en?.trim()) missing.push("name_en");
  if (!raw.country?.trim()) missing.push("country");
  if (grapes.length === 0) missing.push("grape");
  return missing;
}

function evalVivino(raw: RawWineInput): { hasVivino: boolean; autoReviewed: boolean; needsReview: boolean } {
  const p = raw.raw_payload ?? {};
  const hasUrl = typeof p.vivino_url === "string" && (p.vivino_url as string).length > 0;
  if (!hasUrl) return { hasVivino: false, autoReviewed: false, needsReview: false };
  const score = typeof p.vivino_match_score === "number" ? (p.vivino_match_score as number) : null;
  if (score != null && score >= 0.9) return { hasVivino: true, autoReviewed: true, needsReview: false };
  return { hasVivino: true, autoReviewed: false, needsReview: true };
}

function buildVivinoFields(raw: RawWineInput, v: ReturnType<typeof evalVivino>): Record<string, unknown> {
  const p = (raw.raw_payload ?? {}) as Record<string, unknown>;
  if (!v.hasVivino) {
    return {
      vivino_url: null,
      vivino_page_url: null,
      vivino_wine_id: null,
      vivino_rating: null,
      vivino_reviews: null,
      vivino_winery: null,
      vivino_grapes: null,
      vivino_region: null,
      vivino_style: null,
      vivino_alcohol: null,
      vivino_description: null,
      vivino_allergens: null,
      vivino_name: null,
      vivino_needs_review: false,
      vivino_reviewed_at: null,
    };
  }
  const now = new Date().toISOString();
  const wine_id = typeof p.vivino_wine_id === "number" || typeof p.vivino_wine_id === "string"
    ? String(p.vivino_wine_id)
    : null;
  return {
    vivino_url: (p.vivino_url as string) ?? null,
    vivino_page_url: (p.vivino_page_url as string) ?? (p.vivino_url as string) ?? null,
    vivino_wine_id: wine_id,
    vivino_rating: typeof p.vivino_rating === "number" ? p.vivino_rating : null,
    vivino_reviews: typeof p.vivino_reviews === "number" ? p.vivino_reviews : null,
    vivino_winery: (p.vivino_winery as string) ?? null,
    vivino_grapes: (p.vivino_grapes as string) ?? null,
    vivino_region: (p.vivino_region as string) ?? null,
    vivino_style: (p.vivino_style as string) ?? null,
    vivino_alcohol: (p.vivino_alcohol as string) ?? null,
    vivino_description: (p.vivino_description as string) ?? null,
    vivino_allergens: (p.vivino_allergens as string) ?? null,
    vivino_name: (p.vivino_name as string) ?? null,
    vivino_needs_review: v.needsReview,
    vivino_reviewed_at: v.autoReviewed ? now : null,
  };
}

export type PromoteOutcome =
  | { kind: "already_promoted"; wine_id: string }
  | { kind: "missing_fields"; missing: string[] }
  | { kind: "auto_merged"; wine_id: string }
  | { kind: "new_promoted"; wine_id: string }
  | { kind: "candidate"; wine_id: string; reason: MatchReason; score: number }
  | { kind: "error"; message: string };

/**
 * 단건 raw_wine을 정책대로 처리.
 * DB에서 직접 기존 wines를 쿼리하여 매칭.
 */
export async function promoteSingleRawWine(
  sb: SupabaseClient,
  raw: RawWineInput,
): Promise<PromoteOutcome> {
  if (raw.promoted_wine_id) {
    return { kind: "already_promoted", wine_id: raw.promoted_wine_id };
  }

  const grapes = extractGrapes(raw);
  const missing = validateRequired(raw, grapes);
  if (missing.length > 0) {
    return { kind: "missing_fields", missing };
  }

  const key = buildMatchKey({ name_en: raw.name_en, name_ko: raw.name_ko, country: raw.country });
  const now = new Date().toISOString();

  // 1) exact match (3요소) — 정규화 후 DB에서 후보 조회 (name_ko 원본으로 먼저, 정규화는 JS에서 비교)
  // Postgres 쪽에 정규화 함수 없으니 name_ko(trim)로 일단 좁히고 JS에서 필터
  const { data: exactCands } = await sb
    .from("wines")
    .select("id, name_ko, name_en, country")
    .eq("name_ko", (raw.name_ko ?? "").trim())
    .limit(50);

  for (const w of exactCands ?? []) {
    const wk = buildMatchKey({ name_en: w.name_en, name_ko: w.name_ko, country: w.country });
    if (wk.name_en_n === key.name_en_n && wk.name_ko_n === key.name_ko_n && wk.country === key.country) {
      // auto_merge
      const ok = await autoMerge(sb, raw, w.id, grapes, evalVivino(raw), now);
      return ok ? { kind: "auto_merged", wine_id: w.id } : { kind: "error", message: "merge 실패" };
    }
  }

  // 2) 부분 일치 후보 (이름 기반)
  const { data: partialCands } = await sb
    .from("wines")
    .select("id, name_ko, name_en, country")
    .or(`name_ko.eq.${(raw.name_ko ?? "").trim()},name_en.eq.${(raw.name_en ?? "").trim()}`)
    .limit(50);

  let best: { reason: MatchReason; score: number; target: string } | null = null;
  for (const w of partialCands ?? []) {
    const wk = buildMatchKey({ name_en: w.name_en, name_ko: w.name_ko, country: w.country });
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

  // 3) 신규 INSERT
  const v = evalVivino(raw);
  const vivino = buildVivinoFields(raw, v);
  const row: Record<string, unknown> = {
    name_ko: stripVintage(raw.name_ko ?? "") || raw.name_ko,
    name_en: stripVintage(raw.name_en ?? "") || raw.name_en,
    country: raw.country,
    country_ko: raw.country,
    region: raw.region,
    wine_type: normalizeWineType(raw.wine_type),
    producer_ko: raw.producer_ko,
    producer_en: raw.producer_en,
    producer: raw.producer_ko ?? raw.producer_en,
    grape_varieties: grapes,
    price: raw.price,
    image_url: raw.image_url,
    data_source: raw.source,
    source: raw.source,
    source_refs: [raw.id],
    is_published: true,
    ...vivino,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await sb.from("wines").insert(row).select("id").single();
  if (error) {
    // name_ko UNIQUE 충돌 fallback
    if (error.code === "23505" && error.message.includes("wines_name_ko_unique")) {
      const { data: collide } = await sb
        .from("wines")
        .select("id")
        .eq("name_ko", (raw.name_ko ?? "").trim())
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

  const newId = (data as { id: string }).id;
  await sb
    .from("raw_wines")
    .update({ promoted_wine_id: newId, promoted_at: now })
    .eq("id", raw.id);

  return { kind: "new_promoted", wine_id: newId };
}

async function autoMerge(
  sb: SupabaseClient,
  raw: RawWineInput,
  targetId: string,
  grapes: string[],
  v: ReturnType<typeof evalVivino>,
  now: string,
): Promise<boolean> {
  const { data: target, error } = await sb.from("wines").select("*").eq("id", targetId).single();
  if (error || !target) return false;
  const t = target as Record<string, unknown>;

  const updates: Record<string, unknown> = { updated_at: now };
  const fillEmpty = (key: string, value: unknown) => {
    if (value == null || value === "") return;
    if (t[key] == null || t[key] === "") updates[key] = value;
  };
  fillEmpty("name_ko", stripVintage(raw.name_ko ?? "") || raw.name_ko);
  fillEmpty("name_en", stripVintage(raw.name_en ?? "") || raw.name_en);
  fillEmpty("country", raw.country);
  fillEmpty("country_ko", raw.country);
  fillEmpty("region", raw.region);
  fillEmpty("wine_type", normalizeWineType(raw.wine_type));
  fillEmpty("producer_ko", raw.producer_ko);
  fillEmpty("producer_en", raw.producer_en);
  fillEmpty("image_url", raw.image_url);
  fillEmpty("price", raw.price);

  const existingGrapes = Array.isArray(t.grape_varieties) ? (t.grape_varieties as string[]) : [];
  const merged = Array.from(new Set([...existingGrapes, ...grapes].map((g) => g.trim()).filter(Boolean)));
  if (merged.length > existingGrapes.length) updates.grape_varieties = merged;

  const existingRefs = Array.isArray(t.source_refs) ? (t.source_refs as string[]) : [];
  if (!existingRefs.includes(raw.id)) updates.source_refs = [...existingRefs, raw.id];

  if (v.hasVivino && !t.vivino_url) {
    const vivFields = buildVivinoFields(raw, v);
    for (const [k, val] of Object.entries(vivFields)) {
      if (val != null) updates[k] = val;
    }
  }

  if (Object.keys(updates).length > 1) {
    const upd = await sb.from("wines").update(updates).eq("id", targetId);
    if (upd.error) return false;
  }
  const rawUpd = await sb
    .from("raw_wines")
    .update({ promoted_wine_id: targetId, promoted_at: now })
    .eq("id", raw.id);
  return !rawUpd.error;
}

// normalize는 뷰에서도 사용 가능하게 re-export
export { normalize };
