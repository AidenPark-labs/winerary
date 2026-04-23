/**
 * promote-v2: raw_wines → wines 단방향 promote (2026-04-23 재설계)
 *
 * 정책 (project plan drifting-hatching-wozniak 기반):
 *   진입 조건 (AND 4개): name_ko + name_en + country + grape (모두 non-empty)
 *     - winery는 필수 아님 (있으면 저장)
 *   품종 소스 (Vivino 출처 금지):
 *     - wine21: raw_payload.parsed_grape_varieties 중 [A] 필터 (모든 품종이 name_en에 substring 존재)
 *     - winenara/gangnam/naver_shopping/user_submission/admin: raw_wines.grape_variety 컬럼 (, 구분 배열화)
 *   자동 merge: normalize(name_en) + normalize(name_ko) + country 3요소 완전 일치
 *   부분 일치: wine_dedupe_candidates 검수 큐 등록
 *   Vivino: raw_payload.vivino_match_score >= 0.9 → vivino_reviewed_at = now() (자동 승격)
 *           미만 → vivino_needs_review = true, vivino_reviewed_at = null
 *
 * 실행:
 *   --dry-run                         변경 없이 집계만 (기본 권장)
 *   --source=wine21|winenara|...      단일 소스 (기본 all)
 *   --limit=N                         처리 건수 제한 (디버깅)
 *
 * Write 모드 (--dry-run 없이 실행):
 *   auto_merge:  raw.promoted_wine_id=target + target wines의 빈 필드 채움 + source_refs 추가
 *   new_promote: wines에 INSERT (4필드 + Vivino 정책), raw.promoted_wine_id 연결
 *   candidate:   wine_dedupe_candidates INSERT (raw는 promoted 연결 안 함 — 검수 후 처리)
 *   pending 재연결: 실행 말미에 pending_wines.name+country 매칭 → promoted_wine_id 채움
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
import {
  normalize,
  buildMatchKey,
  classifyCandidate,
  type MatchKey,
  type MatchReason,
} from "../src/lib/wine-dedupe";

config({ path: resolve(process.cwd(), ".env.local") });

const sb: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── CLI 파싱 ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const SOURCE_ARG = args.find((a) => a.startsWith("--source="))?.split("=")[1] ?? "all";
const LIMIT_ARG = args.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split("=")[1], 10) : Infinity;
const ALLOWED_SOURCES = ["wine21", "winenara", "gangnam", "naver_shopping", "user_submission", "admin", "all"];
if (!ALLOWED_SOURCES.includes(SOURCE_ARG)) {
  console.error(`--source는 ${ALLOWED_SOURCES.join(" | ")} 중 하나여야 합니다.`);
  process.exit(1);
}

console.log(`=== promote-v2 ${DRY_RUN ? "[DRY-RUN]" : "[WRITE]"} ===`);
console.log(`source: ${SOURCE_ARG}, limit: ${LIMIT === Infinity ? "∞" : LIMIT}\n`);

// ─── 타입 ────────────────────────────────────────────────────────────

interface RawWine {
  id: string;
  source: string;
  source_id: string;
  name_ko: string | null;
  name_en: string | null;
  wine_type: string | null;
  country: string | null;
  region: string | null;
  grape_variety: string | null;
  producer_ko: string | null;
  producer_en: string | null;
  image_url: string | null;
  alcohol: string | null;
  price: number | null;
  raw_payload: Record<string, unknown> | null;
  promoted_wine_id: string | null;
}

interface ExistingWine {
  id: string;
  name_en: string | null;
  name_ko: string | null;
  country: string | null;
}

interface PromoteDecision {
  kind: "skip_already_promoted" | "skip_missing_field" | "auto_merge" | "new_promote" | "candidate";
  raw_id: string;
  target_wine_id?: string;
  missing_fields?: string[];
  candidate_reason?: MatchReason;
  candidate_score?: number;
  vivino_auto_reviewed?: boolean; // match_score >= 0.9
  vivino_needs_review?: boolean;  // < 0.9 but has match
}

// ─── 품종 [A] 필터 (wine21용) ────────────────────────────────────────

const GRAPE_KEYWORDS: Record<string, string[]> = {
  "Cabernet Sauvignon": ["cabernet sauvignon", "cab sauv", "cabernet-sauvignon"],
  "Cabernet Franc": ["cabernet franc"],
  "Merlot": ["merlot"],
  "Pinot Noir": ["pinot noir", "pinot nero", "spatburgunder"],
  "Pinot Grigio": ["pinot grigio", "pinot gris"],
  "Pinot Blanc": ["pinot blanc", "pinot bianco", "weissburgunder"],
  "Chardonnay": ["chardonnay"],
  "Sauvignon Blanc": ["sauvignon blanc", "sauv blanc"],
  "Riesling": ["riesling"],
  "Syrah": ["syrah", "shiraz"],
  "Grenache": ["grenache", "garnacha"],
  "Tempranillo": ["tempranillo"],
  "Sangiovese": ["sangiovese"],
  "Nebbiolo": ["nebbiolo", "barolo", "barbaresco"],
  "Malbec": ["malbec"],
  "Zinfandel": ["zinfandel", "primitivo"],
  "Gewurztraminer": ["gewurz", "gewürz"],
  "Viognier": ["viognier"],
  "Chenin Blanc": ["chenin"],
  "Semillon": ["semillon", "sémillon"],
  "Gamay": ["gamay"],
  "Carménère": ["carmenere", "carménère"],
  "Mourvèdre": ["mourvedre", "mourvèdre", "monastrell"],
  "Petit Verdot": ["petit verdot"],
  "Torrontes": ["torrontes", "torrontés"],
  "Albariño": ["albarino", "albariño"],
  "Verdejo": ["verdejo"],
  "Vermentino": ["vermentino"],
  "Prosecco": ["prosecco", "glera"],
  "Champagne": ["champagne"],
  "Barbera": ["barbera"],
  "Dolcetto": ["dolcetto"],
  "Fiano": ["fiano"],
};

function grapeInName(grape: string, nameLower: string): boolean {
  const keys = GRAPE_KEYWORDS[grape];
  if (keys) return keys.some((k) => nameLower.includes(k));
  return nameLower.includes(grape.toLowerCase());
}

function extractGrapes(raw: RawWine): { grapes: string[]; source: "parsed" | "column" | "none" } {
  if (raw.source === "wine21") {
    // wine21은 parsed_grape_varieties [A] 필터만 사용
    const p = raw.raw_payload;
    const pgv = p && Array.isArray(p.parsed_grape_varieties) ? (p.parsed_grape_varieties as string[]) : [];
    if (pgv.length === 0) return { grapes: [], source: "none" };
    if (!raw.name_en) return { grapes: [], source: "none" };
    const nameLower = raw.name_en.toLowerCase();
    const allIn = pgv.every((g) => grapeInName(g, nameLower));
    if (!allIn) return { grapes: [], source: "none" }; // [B]/[C] 제외
    return { grapes: pgv, source: "parsed" };
  }
  // winenara/gangnam/naver/user_submission/admin: grape_variety 컬럼 파싱
  const raw_gv = raw.grape_variety;
  if (!raw_gv || typeof raw_gv !== "string") return { grapes: [], source: "none" };
  const list = raw_gv
    .split(/[,;/]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (list.length === 0) return { grapes: [], source: "none" };
  return { grapes: list, source: "column" };
}

// ─── 검증 (4필드 AND) ────────────────────────────────────────────────

function validateRequired(raw: RawWine, grapes: string[]): string[] {
  const missing: string[] = [];
  if (!raw.name_ko?.trim()) missing.push("name_ko");
  if (!raw.name_en?.trim()) missing.push("name_en");
  if (!raw.country?.trim()) missing.push("country");
  if (grapes.length === 0) missing.push("grape");
  return missing;
}

// ─── wine_type 정규화 (wines CHECK 제약에 맞추기) ────────────────────

const VALID_WINE_TYPES = new Set(["red", "white", "rose", "sparkling", "fortified", "dessert", "other"]);

function normalizeWineType(raw: string | null | undefined): string {
  const v = (raw ?? "").toLowerCase().trim();
  if (VALID_WINE_TYPES.has(v)) return v;
  return "other";
}

// ─── Vivino 판정 ─────────────────────────────────────────────────────

function evalVivino(raw: RawWine): { hasVivino: boolean; autoReviewed: boolean; needsReview: boolean } {
  const p = raw.raw_payload ?? {};
  const hasUrl = typeof p.vivino_url === "string" && (p.vivino_url as string).length > 0;
  if (!hasUrl) return { hasVivino: false, autoReviewed: false, needsReview: false };
  const score = typeof p.vivino_match_score === "number" ? (p.vivino_match_score as number) : null;
  if (score != null && score >= 0.9) {
    return { hasVivino: true, autoReviewed: true, needsReview: false };
  }
  return { hasVivino: true, autoReviewed: false, needsReview: true };
}

// ─── 기존 wines 인덱스 구축 ───────────────────────────────────────────

interface WinesIndex {
  byExact: Map<string, string>;           // `${en_n}|${ko_n}|${country}` → wines.id
  byEn: Map<string, Array<{ id: string; key: MatchKey }>>; // en_n → [wines]
  byKo: Map<string, Array<{ id: string; key: MatchKey }>>; // ko_n → [wines]
  byNameBoth: Map<string, Array<{ id: string; key: MatchKey }>>; // `${en_n}|${ko_n}` → [wines] (country mismatch 후보)
  byNameKoRaw: Map<string, string>;       // name_ko (원본 문자열 trim) → wines.id (UNIQUE 제약 보호용)
  all: ExistingWine[];
}

async function loadWinesIndex(): Promise<WinesIndex> {
  const all: ExistingWine[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb
      .from("wines")
      .select("id, name_en, name_ko, country")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as ExistingWine[]));
    if (data.length < PAGE) break;
    from += data.length;
  }

  const byExact = new Map<string, string>();
  const byEn = new Map<string, Array<{ id: string; key: MatchKey }>>();
  const byKo = new Map<string, Array<{ id: string; key: MatchKey }>>();
  const byNameBoth = new Map<string, Array<{ id: string; key: MatchKey }>>();
  const byNameKoRaw = new Map<string, string>();

  for (const w of all) {
    const key = buildMatchKey({ name_en: w.name_en, name_ko: w.name_ko, country: w.country });
    if (!key.name_en_n || !key.name_ko_n) continue;
    const exactK = `${key.name_en_n}|${key.name_ko_n}|${key.country}`;
    byExact.set(exactK, w.id);
    const bothK = `${key.name_en_n}|${key.name_ko_n}`;

    const pushTo = (m: Map<string, Array<{ id: string; key: MatchKey }>>, k: string) => {
      if (!k) return;
      const arr = m.get(k);
      if (arr) arr.push({ id: w.id, key });
      else m.set(k, [{ id: w.id, key }]);
    };
    pushTo(byEn, key.name_en_n);
    pushTo(byKo, key.name_ko_n);
    pushTo(byNameBoth, bothK);

    // UNIQUE 제약용: name_ko 원본(trim)으로 인덱스
    const koRaw = (w.name_ko ?? "").trim();
    if (koRaw && !byNameKoRaw.has(koRaw)) byNameKoRaw.set(koRaw, w.id);
  }

  return { byExact, byEn, byKo, byNameBoth, byNameKoRaw, all };
}

// ─── 분류 (기존 wines 대비) ──────────────────────────────────────────

function classifyAgainstWines(
  raw: RawWine,
  idx: WinesIndex,
): { decision: "auto_merge" | "candidate" | "new_promote"; target?: string; reason?: MatchReason; score?: number } {
  const key = buildMatchKey({ name_en: raw.name_en, name_ko: raw.name_ko, country: raw.country });
  if (!key.name_en_n || !key.name_ko_n || !key.country) {
    return { decision: "new_promote" };
  }

  // 1) exact (3요소 일치) → auto_merge
  const exactK = `${key.name_en_n}|${key.name_ko_n}|${key.country}`;
  const exactHit = idx.byExact.get(exactK);
  if (exactHit) {
    return { decision: "auto_merge", target: exactHit };
  }

  // 2) 부분 일치 후보 수집 (중복 제거)
  const cands = new Map<string, MatchKey>();
  const pushCand = (arr: Array<{ id: string; key: MatchKey }> | undefined) => {
    if (!arr) return;
    for (const a of arr) if (!cands.has(a.id)) cands.set(a.id, a.key);
  };
  pushCand(idx.byEn.get(key.name_en_n));
  pushCand(idx.byKo.get(key.name_ko_n));
  pushCand(idx.byNameBoth.get(`${key.name_en_n}|${key.name_ko_n}`));

  let best: { reason: MatchReason; score: number; target: string } | null = null;
  for (const [wineId, wkey] of cands) {
    const c = classifyCandidate(key, wkey);
    if (!c) continue;
    if (!best || c.score > best.score) {
      best = { reason: c.reason, score: c.score, target: wineId };
    }
  }

  if (best) {
    return { decision: "candidate", target: best.target, reason: best.reason, score: best.score };
  }

  // UNIQUE 제약 방어: 같은 name_ko 원본(trim)을 가진 기존 wines가 있으면 검수 큐로
  // (이미 3요소/부분 일치에서 걸리지 않았는데 name_ko만 겹치는 케이스 = 동명이인)
  const koRaw = (raw.name_ko ?? "").trim();
  if (koRaw) {
    const collide = idx.byNameKoRaw.get(koRaw);
    if (collide) {
      return { decision: "candidate", target: collide, reason: "name_en_variant", score: 0.6 };
    }
  }

  return { decision: "new_promote" };
}

// ─── 쓰기 실행 함수 (DRY-RUN 아닐 때만 호출) ─────────────────────────

const NOW_ISO = () => new Date().toISOString();

function buildVivinoFields(raw: RawWine, v: ReturnType<typeof evalVivino>): Record<string, unknown> {
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
  const rating = typeof p.vivino_rating === "number" ? p.vivino_rating : null;
  const reviews = typeof p.vivino_reviews === "number" ? p.vivino_reviews : null;
  const wine_id = typeof p.vivino_wine_id === "number" || typeof p.vivino_wine_id === "string"
    ? String(p.vivino_wine_id)
    : null;
  return {
    vivino_url: (p.vivino_url as string) ?? null,
    vivino_page_url: (p.vivino_page_url as string) ?? (p.vivino_url as string) ?? null,
    vivino_wine_id: wine_id,
    vivino_rating: rating,
    vivino_reviews: reviews,
    vivino_winery: (p.vivino_winery as string) ?? null,
    vivino_grapes: (p.vivino_grapes as string) ?? null,
    vivino_region: (p.vivino_region as string) ?? null,
    vivino_style: (p.vivino_style as string) ?? null,
    vivino_alcohol: (p.vivino_alcohol as string) ?? null,
    vivino_description: (p.vivino_description as string) ?? null,
    vivino_allergens: (p.vivino_allergens as string) ?? null,
    vivino_name: (p.vivino_name as string) ?? null,
    vivino_needs_review: v.needsReview,
    vivino_reviewed_at: v.autoReviewed ? NOW_ISO() : null,
  };
}

function buildInsertRow(raw: RawWine, grapes: string[], v: ReturnType<typeof evalVivino>): Record<string, unknown> {
  const vivino = buildVivinoFields(raw, v);
  return {
    name_ko: raw.name_ko,
    name_en: raw.name_en,
    country: raw.country,
    country_ko: raw.country, // raw.country는 한글이 주. 영문이면 추후 term_dict 보강
    region: raw.region,
    wine_type: normalizeWineType(raw.wine_type),
    producer_ko: raw.producer_ko,
    producer_en: raw.producer_en,
    producer: raw.producer_ko ?? raw.producer_en, // legacy
    grape_varieties: grapes,
    price: raw.price,
    // alcohol: wines 스키마에 일반 alcohol 컬럼 없음 (vivino_alcohol, final_alcohol, gangnam_alcohol만). 저장 생략.
    image_url: raw.image_url,
    data_source: raw.source,
    source: raw.source,
    source_refs: [raw.id],
    is_published: true,
    ...vivino,
    created_at: NOW_ISO(),
    updated_at: NOW_ISO(),
  };
}

async function executeNewPromote(raw: RawWine, grapes: string[], v: ReturnType<typeof evalVivino>): Promise<{ ok: true; id: string } | { ok: false; duplicateNameKo?: boolean }> {
  const row = buildInsertRow(raw, grapes, v);
  const { data, error } = await sb.from("wines").insert(row).select("id").single();
  if (error) {
    if (error.code === "23505" && error.message.includes("wines_name_ko_unique")) {
      return { ok: false, duplicateNameKo: true };
    }
    console.error(`    [INSERT err] raw=${raw.id} (${raw.source}/${raw.source_id}): ${error.message}`);
    return { ok: false };
  }
  const wineId = (data as { id: string }).id;
  const up = await sb
    .from("raw_wines")
    .update({ promoted_wine_id: wineId, promoted_at: NOW_ISO() })
    .eq("id", raw.id);
  if (up.error) {
    console.error(`    [raw link err] wines=${wineId} raw=${raw.id}: ${up.error.message}`);
  }
  return { ok: true, id: wineId };
}

async function executeAutoMerge(raw: RawWine, targetWineId: string, grapes: string[], v: ReturnType<typeof evalVivino>): Promise<boolean> {
  // 기존 wines 조회 (빈 필드만 채우기 위함)
  const { data: target, error: tErr } = await sb
    .from("wines")
    .select("*")
    .eq("id", targetWineId)
    .single();
  if (tErr || !target) {
    console.error(`    [merge fetch err] raw=${raw.id} target=${targetWineId}: ${tErr?.message}`);
    return false;
  }
  const t = target as Record<string, unknown>;

  const updates: Record<string, unknown> = { updated_at: NOW_ISO() };
  const fillEmpty = (key: string, value: unknown) => {
    if (value == null || value === "") return;
    if (t[key] == null || t[key] === "") updates[key] = value;
  };
  fillEmpty("name_ko", raw.name_ko);
  fillEmpty("name_en", raw.name_en);
  fillEmpty("country", raw.country);
  fillEmpty("country_ko", raw.country);
  fillEmpty("region", raw.region);
  fillEmpty("wine_type", normalizeWineType(raw.wine_type));
  fillEmpty("producer_ko", raw.producer_ko);
  fillEmpty("producer_en", raw.producer_en);
  fillEmpty("image_url", raw.image_url);
  fillEmpty("price", raw.price);

  // grape union
  const existingGrapes = Array.isArray(t.grape_varieties) ? (t.grape_varieties as string[]) : [];
  const merged = Array.from(new Set([...existingGrapes, ...grapes].map((g) => g.trim()).filter(Boolean)));
  if (merged.length > existingGrapes.length) updates.grape_varieties = merged;

  // source_refs append
  const existingRefs = Array.isArray(t.source_refs) ? (t.source_refs as string[]) : [];
  if (!existingRefs.includes(raw.id)) {
    updates.source_refs = [...existingRefs, raw.id];
  }

  // Vivino 보강: target에 vivino_url이 비었고 raw에 vivino 정보 있으면 채움 (wine21 score≥0.9만 자동 reviewed)
  if (v.hasVivino && !t.vivino_url) {
    const vivFields = buildVivinoFields(raw, v);
    for (const [k, val] of Object.entries(vivFields)) {
      if (val != null) updates[k] = val;
    }
  }

  if (Object.keys(updates).length > 1) {
    const { error: uErr } = await sb.from("wines").update(updates).eq("id", targetWineId);
    if (uErr) {
      console.error(`    [merge update err] raw=${raw.id}: ${uErr.message}`);
      return false;
    }
  }

  // raw 연결
  const up = await sb
    .from("raw_wines")
    .update({ promoted_wine_id: targetWineId, promoted_at: NOW_ISO() })
    .eq("id", raw.id);
  if (up.error) {
    console.error(`    [raw merge link err] raw=${raw.id}: ${up.error.message}`);
    return false;
  }
  return true;
}

async function executeCandidate(raw: RawWine, targetWineId: string, reason: MatchReason, score: number): Promise<boolean> {
  const { error } = await sb
    .from("wine_dedupe_candidates")
    .insert({
      raw_wine_id: raw.id,
      target_wine_id: targetWineId,
      match_reason: reason,
      match_score: score,
      status: "pending",
    });
  if (error) {
    // unique 충돌이면 이미 있는 후보라 OK
    if (error.code === "23505") return true;
    console.error(`    [candidate err] raw=${raw.id} target=${targetWineId}: ${error.message}`);
    return false;
  }
  return true;
}

async function reconnectPendingWines(): Promise<{ reconnected: number; records: number }> {
  // pending_wines에서 promoted_wine_id 없는 것들을 name+country로 기존 wines에 매칭
  const { data: pending } = await sb
    .from("pending_wines")
    .select("id, name_ko, name_en, country, submitted_by")
    .is("promoted_wine_id", null);
  if (!pending || pending.length === 0) return { reconnected: 0, records: 0 };

  let reconnected = 0;
  let records = 0;
  const now = NOW_ISO();

  for (const p of pending) {
    const key = buildMatchKey({ name_en: p.name_en, name_ko: p.name_ko, country: p.country });
    if (!key.name_en_n || !key.name_ko_n || !key.country) continue;
    const { data: matches } = await sb
      .from("wines")
      .select("id, name_en, name_ko, country")
      .ilike("name_en", p.name_en ?? "")
      .limit(10);
    const hit = (matches ?? []).find((w) => {
      const wk = buildMatchKey({ name_en: w.name_en, name_ko: w.name_ko, country: w.country });
      return wk.name_en_n === key.name_en_n && wk.country === key.country;
    });
    if (!hit) continue;

    const up1 = await sb
      .from("pending_wines")
      .update({ promoted_wine_id: hit.id, status: "promoted", updated_at: now })
      .eq("id", p.id);
    if (up1.error) continue;

    // wine_records.wine_id도 연결 (같은 pending_wine_id 참조하는 것들)
    const up2 = await sb
      .from("wine_records")
      .update({ wine_id: hit.id })
      .eq("pending_wine_id", p.id)
      .is("wine_id", null);
    records += up2.error ? 0 : 1; // 개별 개수는 count=exact 별도 필요하지만 대략만

    reconnected++;
  }
  return { reconnected, records };
}

// ─── 메인 루프 ───────────────────────────────────────────────────────

interface Stats {
  total: number;
  skipAlreadyPromoted: number;
  skipMissing: { name_ko: number; name_en: number; country: number; grape: number };
  autoMerge: number;
  newPromote: number;
  candidates: Record<MatchReason, number>;
  vivinoAutoReviewed: number;
  vivinoNeedsReview: number;
  vivinoNone: number;
  grapeSourceParsed: number;
  grapeSourceColumn: number;
  writeErrors: number;
}

function emptyStats(): Stats {
  return {
    total: 0,
    skipAlreadyPromoted: 0,
    skipMissing: { name_ko: 0, name_en: 0, country: 0, grape: 0 },
    autoMerge: 0,
    newPromote: 0,
    candidates: { name_ko_variant: 0, name_en_variant: 0, country_mismatch: 0, fuzzy_name: 0 },
    vivinoAutoReviewed: 0,
    vivinoNeedsReview: 0,
    vivinoNone: 0,
    grapeSourceParsed: 0,
    grapeSourceColumn: 0,
    writeErrors: 0,
  };
}

async function fetchBatchWithRetry(source: string, from: number, take: number, tries = 3): Promise<RawWine[]> {
  let lastErr: unknown = null;
  for (let i = 0; i < tries; i++) {
    const { data, error } = await sb
      .from("raw_wines")
      .select(
        "id, source, source_id, name_ko, name_en, wine_type, country, region, grape_variety, producer_ko, producer_en, image_url, alcohol, price, raw_payload, promoted_wine_id",
      )
      .eq("source", source)
      .order("id", { ascending: true })
      .range(from, from + take - 1);
    if (!error) return (data ?? []) as RawWine[];
    lastErr = error;
    console.error(`    [fetch retry ${i + 1}/${tries}] from=${from}: ${error.message}`);
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
  throw lastErr;
}

async function processSource(source: string, idx: WinesIndex): Promise<Stats> {
  const stats = emptyStats();
  let from = 0;
  const PAGE = 500;
  let processed = 0;

  while (processed < LIMIT) {
    const take = Math.min(PAGE, LIMIT - processed);
    const data = await fetchBatchWithRetry(source, from, take);
    if (!data || data.length === 0) break;

    for (const r of data as RawWine[]) {
      stats.total++;

      // 이미 promote된 건 skip
      if (r.promoted_wine_id) {
        stats.skipAlreadyPromoted++;
        continue;
      }

      // 품종 추출
      const { grapes, source: grapeSource } = extractGrapes(r);
      if (grapeSource === "parsed") stats.grapeSourceParsed++;
      else if (grapeSource === "column") stats.grapeSourceColumn++;

      // 4필드 검증
      const missing = validateRequired(r, grapes);
      if (missing.length > 0) {
        for (const m of missing) {
          if (m === "name_ko") stats.skipMissing.name_ko++;
          else if (m === "name_en") stats.skipMissing.name_en++;
          else if (m === "country") stats.skipMissing.country++;
          else if (m === "grape") stats.skipMissing.grape++;
        }
        continue;
      }

      // 기존 wines 대비 분류
      const cls = classifyAgainstWines(r, idx);

      // Vivino 판정
      const v = evalVivino(r);
      if (!v.hasVivino) stats.vivinoNone++;
      else if (v.autoReviewed) stats.vivinoAutoReviewed++;
      else stats.vivinoNeedsReview++;

      if (cls.decision === "auto_merge" && cls.target) {
        stats.autoMerge++;
        if (!DRY_RUN) {
          const ok = await executeAutoMerge(r, cls.target, grapes, v);
          if (!ok) stats.writeErrors++;
        }
      } else if (cls.decision === "new_promote") {
        stats.newPromote++;
        if (!DRY_RUN) {
          const result = await executeNewPromote(r, grapes, v);
          if (!result.ok) {
            if (result.duplicateNameKo) {
              // UNIQUE 충돌 fallback — byNameKoRaw에서 충돌한 wines.id 찾아 candidate 등록
              const koRaw = (r.name_ko ?? "").trim();
              const collide = idx.byNameKoRaw.get(koRaw);
              if (collide) {
                stats.newPromote--;
                stats.candidates.name_en_variant++;
                await executeCandidate(r, collide, "name_en_variant", 0.5);
              } else {
                stats.writeErrors++;
              }
            } else {
              stats.writeErrors++;
            }
          } else {
            const newId = result.id;
            // 인덱스에 추가해 같은 배치의 다음 raw들이 이 신규 wines를 dedupe 대상으로 삼게 함
            const key = buildMatchKey({ name_en: r.name_en, name_ko: r.name_ko, country: r.country });
            if (key.name_en_n && key.name_ko_n && key.country) {
              idx.byExact.set(`${key.name_en_n}|${key.name_ko_n}|${key.country}`, newId);
              const pushTo = (m: Map<string, Array<{ id: string; key: MatchKey }>>, k: string) => {
                if (!k) return;
                const arr = m.get(k);
                if (arr) arr.push({ id: newId, key });
                else m.set(k, [{ id: newId, key }]);
              };
              pushTo(idx.byEn, key.name_en_n);
              pushTo(idx.byKo, key.name_ko_n);
              pushTo(idx.byNameBoth, `${key.name_en_n}|${key.name_ko_n}`);
            }
            const koRaw = (r.name_ko ?? "").trim();
            if (koRaw && !idx.byNameKoRaw.has(koRaw)) idx.byNameKoRaw.set(koRaw, newId);
          }
        }
      } else if (cls.decision === "candidate" && cls.reason && cls.target) {
        stats.candidates[cls.reason]++;
        if (!DRY_RUN) {
          const ok = await executeCandidate(r, cls.target, cls.reason, cls.score ?? 0);
          if (!ok) stats.writeErrors++;
        }
      }

      processed++;
      if (processed % 500 === 0) {
        process.stdout.write(`\r    [${source}] 진행 ${processed.toLocaleString()}…`);
      }
      if (processed >= LIMIT) break;
    }

    if (data.length < take) break;
    from += data.length;
  }

  return stats;
}

function printStats(source: string, s: Stats): void {
  console.log(`\n━━━ ${source} ━━━`);
  console.log(`  총 raw_wines: ${s.total.toLocaleString()}`);
  console.log(`  이미 promote: ${s.skipAlreadyPromoted.toLocaleString()} (skip)`);
  const missingTotal =
    s.skipMissing.name_ko + s.skipMissing.name_en + s.skipMissing.country + s.skipMissing.grape;
  const pass4 = s.autoMerge + s.newPromote +
    s.candidates.name_ko_variant + s.candidates.name_en_variant +
    s.candidates.country_mismatch + s.candidates.fuzzy_name;
  console.log(`  4필드 통과: ${pass4.toLocaleString()}`);
  console.log(`    → 자동 merge (기존 wines에):    ${s.autoMerge.toLocaleString()}`);
  console.log(`    → 신규 promote:                 ${s.newPromote.toLocaleString()}`);
  console.log(`    → 검수 큐 등록:                 ${(pass4 - s.autoMerge - s.newPromote).toLocaleString()}`);
  console.log(`       · name_ko_variant: ${s.candidates.name_ko_variant}`);
  console.log(`       · name_en_variant: ${s.candidates.name_en_variant}`);
  console.log(`       · country_mismatch: ${s.candidates.country_mismatch}`);
  console.log(`       · fuzzy_name: ${s.candidates.fuzzy_name}`);
  console.log(`  4필드 실패 (promote 제외): ${missingTotal.toLocaleString()}`);
  if (s.writeErrors > 0) console.log(`  ⚠ 쓰기 에러:                 ${s.writeErrors}`);
  console.log(`       · name_ko 없음: ${s.skipMissing.name_ko}`);
  console.log(`       · name_en 없음: ${s.skipMissing.name_en}`);
  console.log(`       · country 없음: ${s.skipMissing.country}`);
  console.log(`       · grape 없음:   ${s.skipMissing.grape}`);
  console.log(`  Vivino (pass4 범위):`);
  console.log(`       · 자동 reviewed (score≥0.9): ${s.vivinoAutoReviewed}`);
  console.log(`       · 검수 필요 (score<0.9):     ${s.vivinoNeedsReview}`);
  console.log(`       · Vivino 매칭 없음:          ${s.vivinoNone}`);
  if (source === "wine21") {
    console.log(`  품종 소스:`);
    console.log(`       · parsed_grape_varieties [A]: ${s.grapeSourceParsed}`);
  } else {
    console.log(`  품종 소스:`);
    console.log(`       · grape_variety 컬럼:          ${s.grapeSourceColumn}`);
  }
}

function aggregateStats(all: Stats[]): Stats {
  const t = emptyStats();
  for (const s of all) {
    t.total += s.total;
    t.skipAlreadyPromoted += s.skipAlreadyPromoted;
    t.writeErrors += s.writeErrors;
    t.skipMissing.name_ko += s.skipMissing.name_ko;
    t.skipMissing.name_en += s.skipMissing.name_en;
    t.skipMissing.country += s.skipMissing.country;
    t.skipMissing.grape += s.skipMissing.grape;
    t.autoMerge += s.autoMerge;
    t.newPromote += s.newPromote;
    (Object.keys(t.candidates) as MatchReason[]).forEach(
      (k) => (t.candidates[k] += s.candidates[k]),
    );
    t.vivinoAutoReviewed += s.vivinoAutoReviewed;
    t.vivinoNeedsReview += s.vivinoNeedsReview;
    t.vivinoNone += s.vivinoNone;
    t.grapeSourceParsed += s.grapeSourceParsed;
    t.grapeSourceColumn += s.grapeSourceColumn;
  }
  return t;
}

async function main() {
  console.log("wines 인덱스 로드 중...");
  const idx = await loadWinesIndex();
  console.log(`  기존 wines: ${idx.all.length.toLocaleString()}건, byExact 크기: ${idx.byExact.size.toLocaleString()}\n`);

  const sources = SOURCE_ARG === "all"
    ? ["wine21", "winenara", "gangnam", "naver_shopping", "user_submission"]
    : [SOURCE_ARG];

  const allStats: Stats[] = [];
  for (const src of sources) {
    const s = await processSource(src, idx);
    printStats(src, s);
    allStats.push(s);
  }

  if (sources.length > 1) {
    console.log("\n\n━━━ 합계 ━━━");
    printStats("ALL", aggregateStats(allStats));
  }

  // 쓰기 모드일 때: pending_wines 재연결
  if (!DRY_RUN) {
    console.log("\n\npending_wines 자동 재연결 실행 중...");
    const rec = await reconnectPendingWines();
    console.log(`  재연결: ${rec.reconnected}건 (연결된 wine_records 배치: ${rec.records}회)`);
  }

  console.log(`\n※ ${DRY_RUN ? "DRY-RUN 완료. 실제 DB 변경 없음." : "WRITE 완료."}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
