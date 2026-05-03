/**
 * wines_v2 통합 변환 모듈 (v5)
 *
 * 모든 INSERT/UPDATE 진입점이 호출하는 단일 진실 공급원.
 * 변환 로직 흩어짐 방지.
 *
 * 책임:
 *   1. 입력 → wines_v2 row + (있으면) vivino_wines row로 분리
 *   2. 한·영 양방향 변환 (term_dict 1차 → LLM 2차 → 실패 시 needs_review)
 *   3. enum/numeric 정규화 (wine_type, alcohol)
 *   4. source_snapshot jsonb 빌드 (naver/gangnam/wine21/winenara)
 *   5. UPDATE 시 빈 필드 채움 + locked_fields 보호
 *
 * 호출자:
 *   - lib/promote-raw-wine.ts (promoteSingleRawWine, autoMerge, insertWineDirectly)
 *   - admin/wines/actions.ts (updateWine, updateWineVivino, clearWineVivino)
 *   - admin/vivino-review/actions.ts (updateWineFields, replaceVivinoUrl)
 *   - admin/dedupe-review/actions.ts (confirmDedupe)
 *   - api/vivino/rating/route.ts (cacheRating)
 *   - api/admin/records/route.ts (create_wine)
 *   - scripts/build-wines-v2.ts (Phase 1 backfill)
 *   - scripts/promote-v2.ts
 *
 * 관련 문서: docs/wines-schema-simplification.md §4.6
 *
 * 참고:
 *   - LLM 통합은 후속 단계 (현재는 term_dict 매칭만, 미커버는 needs_review_reasons로 표기)
 *   - search_tsv는 DB 트리거가 자동 빌드 (모듈 책임 아님)
 *   - search_jamo, embedding은 별도 잡이 처리
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// 타입 정의
// ============================================================================

export type WineSource =
  | "wine21"
  | "winenara"
  | "gangnam"
  | "naver_shopping"
  | "user_submission"
  | "admin";

const VALID_WINE_TYPES = new Set([
  "red",
  "white",
  "rose",
  "sparkling",
  "fortified",
  "dessert",
  "other",
]);

export interface VivinoInput {
  url: string; // canonical
  wine_id?: string | number | null;
  name?: string | null;
  rating?: number | null;
  reviews?: number | null;
  winery?: string | null;
  grapes?: string | null;
  region?: string | null;
  style?: string | null;
  alcohol?: string | null;
  description?: string | null;
  allergens?: string | null;
  image_url?: string | null;
  match_score?: number | null;
  scraped_at?: string | null;
  raw_payload?: Record<string, unknown> | null;
}

export interface LegacySources {
  naver_link?: string | null;
  naver_image?: string | null;
  gangnam_alcohol?: string | null;
  review_image_url?: string | null;
  raw_payload?: Record<string, unknown> | null;
}

/**
 * 모든 INSERT/UPDATE 진입점이 받는 입력.
 * 한·영 모두 허용 — 모듈이 자동 변환.
 *
 * 필수 필드 (v3 정책 — wines 진입 4필드):
 *   name_ko, name_en, country, grape_varieties (1개 이상)
 * 빈 값이면 transformInput이 ok:false 반환.
 */
export interface WinesV2Input {
  source: WineSource;
  source_refs?: string[];

  name_ko: string;
  name_en: string;

  wine_type?: string | null; // enum 자동 정규화 (외 값은 'other')
  wine_style?: string | null; // 영문, 그대로 저장

  // country는 필수. 한·영 모두 허용. 매칭 실패한 영문은 그대로 통과 + needs_review
  country: string;
  // region은 옵셔널. NULL 허용
  region?: string | null;

  // 영문 권장. 한글 입력 시 LLM 변환 (단계 후속), 미커버는 needs_review
  producer?: string | null;

  // 한·영 모두 허용. 자동으로 한글 배열로 정규화
  grape_varieties?: string[] | null;

  alcohol?: string | number | null; // "13.5%" / 13.5 / "13" 모두 허용
  brand?: string | null;
  price?: number | null;
  description?: string | null;
  image_url?: string | null;
  is_published?: boolean;
  locked_fields?: string[];

  // Vivino 데이터 — 있으면 vivino_wines로 분기
  vivino?: VivinoInput | null;

  // source_snapshot 후보
  legacy?: LegacySources;
}

/** wines_v2 row (DB 직렬화 형태) */
export interface WinesV2Row {
  id: string;
  source: string;
  source_refs: string[] | null;
  source_snapshot: Record<string, unknown> | null;
  name_ko: string;
  name_en: string;
  wine_type: string;
  wine_style: string | null;
  country_ko: string;        // NOT NULL (DB 제약). 매칭 실패 영문도 그대로 통과.
  region_ko: string | null;
  producer: string | null;
  grape_varieties: string[];
  alcohol: number | null;
  brand: string | null;
  price: number | null;
  description: string | null;
  image_url: string | null;
  is_published: boolean;
  search_query_en: string | null;
  locked_fields: string[] | null;
  needs_review: boolean;
  needs_review_reasons: string[] | null;
  grape_blend: GrapeBlendItem[] | null;
  created_at?: string;
  updated_at?: string;
}

export interface GrapeBlendItem {
  /** 표준 한글 (term_dict 매칭 시) 또는 원문 */
  grape: string;
  /** 0~100, 정수 또는 소수 */
  percent: number;
}

/** vivino_wines row */
export interface VivinoWineRow {
  wine_id: string;
  vivino_url: string;
  vivino_wine_id: string | null;
  vivino_name: string | null;
  rating: number | null;
  reviews: number | null;
  winery: string | null;
  grapes: string | null;
  region: string | null;
  style: string | null;
  alcohol: string | null;
  description: string | null;
  allergens: string | null;
  image_url: string | null;
  needs_review: boolean;
  reviewed_at: string | null;
  match_score: number | null;
  scraped_at: string | null;
  raw_payload: Record<string, unknown> | null;
}

/**
 * 변환 결과. discriminated union — 호출자는 ok 필드로 분기.
 *
 * - ok=true: wineRow + (선택적) vivinoRow + needs_review_reasons
 * - ok=false: 필수 필드 누락 등으로 변환 자체가 불가능. wines_v2 진입 거부.
 */
export type TransformResult =
  | {
      ok: true;
      wineRow: Omit<WinesV2Row, "id" | "created_at" | "updated_at">;
      vivinoRow: Omit<VivinoWineRow, "wine_id"> | null;
      /** 모호하거나 변환 실패한 항목 — `category:input` 형식. 비어있지 않으면 needs_review=true */
      needs_review_reasons: string[];
    }
  | {
      ok: false;
      error: string;
    };

export interface UpdateResult {
  wineUpdate: Partial<WinesV2Row>;
  vivinoUpsert: Omit<VivinoWineRow, "wine_id"> | null;
  vivinoDelete: boolean;
  needs_review_reasons: string[];
}

// ============================================================================
// 단위 함수: enum, numeric, snapshot
// ============================================================================

/** wine_type enum 강제. 외 값은 'other'. */
export function normalizeWineTypeEnum(v: string | null | undefined): string {
  const s = (v ?? "").toLowerCase().trim();
  if (!s) return "other";
  // 흔한 변형 정규화
  if (s === "rosé") return "rose";
  if (s === "fortified wine") return "fortified";
  if (s === "dessert wine") return "dessert";
  if (s === "sparkling wine") return "sparkling";
  return VALID_WINE_TYPES.has(s) ? s : "other";
}

/**
 * alcohol 텍스트/숫자 → numeric (소수 둘째자리 반올림).
 * "13.5%" / "13,5" / "13.5도" / 13.5 / "13" / "13.5 % vol" 모두 허용.
 * 0~30 범위 외는 NULL.
 */
export function parseAlcoholNumeric(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 0 || v > 30) return null;
    return Math.round(v * 100) / 100;
  }
  const s = String(v).replace(",", ".");
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n) || n < 0 || n > 30) return null;
  return Math.round(n * 100) / 100;
}

/**
 * source_snapshot jsonb 빌드. 소스별 보조 데이터를 구조화.
 * 빈 객체면 NULL 반환 (DB 빈 객체 저장 회피).
 */
export function buildSourceSnapshot(
  source: WineSource,
  legacy: LegacySources | undefined,
): Record<string, unknown> | null {
  const l = legacy ?? {};
  const out: Record<string, unknown> = {};

  // naver
  if (l.naver_link || l.naver_image) {
    out.naver = {
      ...(l.naver_link ? { link: l.naver_link } : {}),
      ...(l.naver_image ? { image: l.naver_image } : {}),
    };
  }

  // gangnam
  if (l.gangnam_alcohol) {
    out.gangnam = { raw_alcohol_text: l.gangnam_alcohol };
  }

  // wine21 (review_image + raw_payload 일부)
  const wine21Parts: Record<string, unknown> = {};
  if (l.review_image_url) wine21Parts.review_image_url = l.review_image_url;
  if (source === "wine21" && l.raw_payload) {
    const p = l.raw_payload;
    const pick = (k: string) => (p[k] != null ? { [k]: p[k] } : {});
    Object.assign(
      wine21Parts,
      pick("wine_idx"),
      pick("winery_idx"),
      pick("vintage"),
      pick("hash_tag"),
      pick("tasting_count"),
      pick("total_point"),
      pick("capacity_ml"),
    );
  }
  if (Object.keys(wine21Parts).length > 0) out.wine21 = wine21Parts;

  return Object.keys(out).length > 0 ? out : null;
}

// ============================================================================
// term_dict 룩업
// ============================================================================

export type TermCategory = "grape" | "country" | "region" | "style" | "winery";

export interface TermDictEntry {
  category: string;
  en: string;
  ko: string;
  aliases: string[];
}

export interface TermDictLookup {
  /** 원본 표기 변환 결과 — entry 또는 null */
  match(category: TermCategory, value: string | null | undefined): TermDictEntry | null;
}

/** 정규화 키 (악센트·구두점·공백 제거 + 소문자) */
export function normKey(s: string): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

/** term_dict 전체 카테고리 한 번에 로드 → 룩업 객체 반환 */
export async function loadTermDict(sb: SupabaseClient): Promise<TermDictLookup> {
  const map = new Map<string, TermDictEntry>(); // `${category}::${normKey}` → entry
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from("term_dict")
      .select("category, en, ko, aliases")
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`term_dict 로드 실패: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data as Array<{
      category: string;
      en: string;
      ko: string;
      aliases: string[] | null;
    }>) {
      const entry: TermDictEntry = {
        category: r.category,
        en: r.en,
        ko: r.ko,
        aliases: Array.isArray(r.aliases) ? r.aliases : [],
      };
      // 우선순위: ko/en이 canonical, alias는 fallback. 다른 entry의 alias가
      // 이미 점유한 키도 ko/en은 덮어쓰되, alias는 비어있는 슬롯에만 set.
      // (예전엔 단일 forEach였는데, "Côt"의 alias '말벡'이 "Malbec/말벡"의
      // ko 키를 덮어써서 정규화가 잘못되던 버그가 있었음.)
      for (const k of [entry.en, entry.ko].filter(Boolean)) {
        const nk = normKey(k);
        if (nk) map.set(`${entry.category}::${nk}`, entry);
      }
      for (const k of entry.aliases.filter(Boolean)) {
        const nk = normKey(k);
        const key = `${entry.category}::${nk}`;
        if (nk && !map.has(key)) map.set(key, entry);
      }
    }
    if (data.length < PAGE) break;
    offset += data.length;
  }

  return {
    match(category, value) {
      if (!value) return null;
      const nk = normKey(value);
      if (!nk) return null;
      return map.get(`${category}::${nk}`) ?? null;
    },
  };
}

// ============================================================================
// 번역 함수 (현재 term_dict만, LLM은 후속 단계)
// ============================================================================

const HANGUL_RE = /[가-힯ᄀ-ᇿ㄰-㆏]/;

function isHangul(s: string): boolean {
  return HANGUL_RE.test(s);
}

export interface TranslateGrapesResult {
  ko: string[];
  /** term_dict에서 매칭 안 된 영문 입력 (LLM 단계 대상) */
  unknowns: string[];
  /** 비율 정보가 추출된 항목만 (입력에 percent 없으면 빈 배열) */
  blend: GrapeBlendItem[];
}

/**
 * 입력 항목에서 비율과 이름을 분리.
 * 패턴 (대소문자·공백 너그러움):
 *   - "Cabernet Sauvignon 60%"
 *   - "60% Cabernet Sauvignon"
 *   - "Cabernet Sauvignon (60%)"
 * 비율 없으면 percent=null.
 */
export function extractGrapePercent(raw: string): { name: string; percent: number | null } {
  let s = raw.trim();
  if (!s) return { name: "", percent: null };

  // 괄호 안 비율: "Cabernet Sauvignon (60%)"
  const paren = s.match(/\(\s*(\d+(?:\.\d+)?)\s*%\s*\)/);
  if (paren) {
    const p = parseFloat(paren[1]);
    s = s.replace(paren[0], "").trim();
    return { name: stripParenthetical(s), percent: clampPercent(p) };
  }

  // 앞 비율: "60% Cabernet Sauvignon"
  const head = s.match(/^\s*(\d+(?:\.\d+)?)\s*%\s+(.+)$/);
  if (head) {
    return { name: stripParenthetical(head[2].trim()), percent: clampPercent(parseFloat(head[1])) };
  }

  // 뒤 비율: "Cabernet Sauvignon 60%"
  const tail = s.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*%\s*$/);
  if (tail) {
    return { name: stripParenthetical(tail[1].trim()), percent: clampPercent(parseFloat(tail[2])) };
  }

  return { name: stripParenthetical(s), percent: null };
}

function clampPercent(p: number): number | null {
  if (!Number.isFinite(p) || p < 0 || p > 100) return null;
  return p;
}

/**
 * 괄호 노트 제거 (grape, region 공용).
 * "Cabernet Sauvignon (blend)" → "Cabernet Sauvignon"
 * "뻬르낭-베르즐레스(Pernand-Vergelesses)" → "뻬르낭-베르즐레스"
 */
function stripParenthetical(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * 괄호 안에 영문이 있으면 추출 ("할란 에스테이트 (Harlan Estate)" → "Harlan Estate").
 * 영문 외 문자(한글 등) 섞이면 null.
 */
function extractParentheticalEnglish(s: string): string | null {
  const m = s.match(/\(([^)]+)\)/);
  if (!m) return null;
  const inside = m[1].trim();
  if (!inside) return null;
  if (!LATIN_RE.test(inside)) return null;
  if (HANGUL_RE.test(inside)) return null;
  return inside;
}

const LATIN_RE = /[A-Za-z]/;

/**
 * grape_varieties 입력(한·영 혼재) → 한글 배열 정규화 + 비율 분리.
 * - term_dict 1차 매칭 → 표준 한글
 * - 매칭 실패한 한글 입력은 그대로 유지 (사전 미커버 한글은 통과)
 * - 매칭 실패한 영문은 unknowns로 (needs_review 사유, LLM 단계 대상)
 * - 비율 정보가 있는 항목은 blend 배열로 분리 수집
 *
 * 중복 제거 (이름 기준).
 */
export function translateGrapesToKo(
  grapes: Array<string | null | undefined>,
  dict: TermDictLookup,
): TranslateGrapesResult {
  const out: string[] = [];
  const seen = new Set<string>();
  const unknowns: string[] = [];
  const blend: GrapeBlendItem[] = [];

  for (const g of grapes) {
    if (g == null) continue;
    const raw = String(g).trim();
    if (!raw) continue;

    // 1) 비율 + 이름 분리
    const { name, percent } = extractGrapePercent(raw);
    if (!name) continue;

    // 2) 이름 정규화 (term_dict)
    const matched = dict.match("grape", name);
    let canonical: string | null = null;
    if (matched) {
      canonical = matched.ko;
    } else if (isHangul(name)) {
      canonical = name; // 한글 미커버 → 통과
    } else {
      if (!unknowns.includes(name)) unknowns.push(name);
      // 영문 미커버여도 blend·varieties에 일단 남길지? → varieties는 한글 표준이라 누락. blend도 일단 누락.
      continue;
    }

    // 3) varieties (이름만, dedup)
    if (!seen.has(canonical)) {
      seen.add(canonical);
      out.push(canonical);
    }

    // 4) blend (비율 있을 때만)
    if (percent != null) {
      blend.push({ grape: canonical, percent });
    }
  }

  return { ko: out, unknowns, blend };
}

export interface TranslateRegionResult {
  ko: string | null;
  unknown: boolean;
}

/**
 * country/region 입력 → 한글 (출신어 발음 우선 정책, term_dict 룩업).
 *
 * region 정의: 와인이 명시한 가장 구체적인 산지 (finest level).
 * path 형식 (Vivino 표준 "광역 → 세부", e.g. "France / Bordeaux / Médoc"):
 *   - 가장 뒤(finest)부터 매칭 시도, 실패 시 한 단계씩 위로 (fallback up)
 *   - 첫 매칭되는 단계의 한글 반환
 *
 * 미매칭 처리:
 *   - 모든 part가 영문 → null + unknown=true (LLM 단계 대상)
 *   - finest part가 한글 → 그대로 통과 (사용자 입력 존중)
 *
 * 각 part에 괄호 노트 제거 적용 (예: "뻬르낭-베르즐레스(Pernand-Vergelesses)").
 */
export function translateRegionToKo(
  category: "country" | "region",
  value: string | null | undefined,
  dict: TermDictLookup,
): TranslateRegionResult {
  if (!value) return { ko: null, unknown: false };
  const trimmed = String(value).trim();
  if (!trimmed) return { ko: null, unknown: false };

  // region은 path 분해, country는 단일 단어
  const rawParts =
    category === "region"
      ? trimmed.split(/[/>]/).map((s) => s.trim()).filter(Boolean)
      : [trimmed];
  const parts = rawParts.map((p) => stripParenthetical(p)).filter(Boolean);
  if (parts.length === 0) return { ko: null, unknown: false };

  // finest(뒤) 부터 매칭 시도 — 매칭되면 그 단계의 한글 반환
  for (let i = parts.length - 1; i >= 0; i--) {
    const m = dict.match(category, parts[i]);
    if (m) return { ko: m.ko, unknown: false };
  }

  // 매칭 실패 — finest part 처리
  const finest = parts[parts.length - 1];
  if (isHangul(finest)) {
    // 한글 미커버 → 그대로 통과 (사용자 입력 존중)
    return { ko: finest, unknown: false };
  }
  // 영문 미커버
  if (category === "country") {
    // country는 NOT NULL이라 영문이라도 통과 + needs_review (LLM 단계에서 한글화)
    return { ko: finest, unknown: true };
  }
  // region은 NULL 허용 → null + needs_review
  return { ko: null, unknown: true };
}

export interface TranslateProducerResult {
  /** 영문 표준 (canonical) */
  en: string | null;
  /** 사전 매칭 실패 시 true (LLM 변환 단계 대상) */
  unknown: boolean;
}

/**
 * producer를 영문(canonical)으로 정규화.
 * - 영문 + 사전 매칭 → 표준 영문 (e.g. "Chateau Margaux" → "Château Margaux")
 * - 영문 + 사전 미커버 → 영문 그대로 통과 (정상 영문)
 * - 한글 + 사전 매칭 → 표준 영문
 * - 한글 + 사전 미커버 + 괄호 영문 있음 ("할란 에스테이트 (Harlan Estate)") → 괄호 영문 추출
 * - 한글 + 사전 미커버 + 괄호 영문 없음 → null + unknown=true (LLM 단계)
 * - 빈 입력 → null
 */
export function translateProducer(
  producer: string | null | undefined,
  dict: TermDictLookup,
): TranslateProducerResult {
  const input = producer?.trim() || null;
  if (!input) return { en: null, unknown: false };

  // 1) 사전 매칭 (입력 그대로)
  const m1 = dict.match("winery", input);
  if (m1) return { en: m1.en, unknown: false };

  // 2) 괄호 제거 후 사전 매칭 시도
  const stripped = stripParenthetical(input);
  if (stripped !== input && stripped) {
    const m2 = dict.match("winery", stripped);
    if (m2) return { en: m2.en, unknown: false };
  }

  // 3) 한글 입력 시 괄호 안 영문 추출
  if (isHangul(input)) {
    const en = extractParentheticalEnglish(input);
    if (en) return { en, unknown: false };
    // 한글 + 괄호 영문 없음 → LLM 단계
    return { en: null, unknown: true };
  }

  // 4) 영문 미커버 → 그대로 통과
  return { en: input, unknown: false };
}

// ============================================================================
// 메인 진입: transformInput / buildUpdatePatch
// ============================================================================

/**
 * 모든 INSERT 진입점이 호출.
 * @param sb supabase client (term_dict 로드용)
 * @param input 변환할 입력
 * @param dict 미리 로드한 사전 (배치 INSERT 시 한 번 로드해서 재사용)
 */
export async function transformInput(
  sb: SupabaseClient,
  input: WinesV2Input,
  dict?: TermDictLookup,
): Promise<TransformResult> {
  // 필수 필드 검증 (v3 정책: 4필드)
  const missing: string[] = [];
  if (!input.name_ko?.trim()) missing.push("name_ko");
  if (!input.name_en?.trim()) missing.push("name_en");
  if (!input.country?.trim()) missing.push("country");
  if (!Array.isArray(input.grape_varieties) || input.grape_varieties.length === 0) {
    missing.push("grape_varieties");
  }
  if (missing.length > 0) {
    return { ok: false, error: `필수 필드 누락: ${missing.join(", ")}` };
  }

  const d = dict ?? (await loadTermDict(sb));
  const reasons: string[] = [];

  // wine_type
  const wineType = normalizeWineTypeEnum(input.wine_type);

  // country (NOT NULL 보장 — translateRegionToKo가 영문 미커버여도 통과)
  const countryRes = translateRegionToKo("country", input.country, d);
  if (countryRes.unknown) reasons.push(`country:${input.country}`);

  // region
  const regionRes = translateRegionToKo("region", input.region, d);
  if (regionRes.unknown) reasons.push(`region:${input.region}`);

  // producer (영문 표준)
  const producerRes = translateProducer(input.producer, d);
  if (producerRes.unknown) {
    reasons.push(`producer:${input.producer}`);
  }

  // grape
  const grapeInput = Array.isArray(input.grape_varieties) ? input.grape_varieties : [];
  const grapeRes = translateGrapesToKo(grapeInput, d);
  for (const u of grapeRes.unknowns) reasons.push(`grape:${u}`);

  // alcohol
  const alcoholNum = parseAlcoholNumeric(input.alcohol);

  // source_snapshot
  const snapshot = buildSourceSnapshot(input.source, input.legacy);

  const wineRow: Omit<WinesV2Row, "id" | "created_at" | "updated_at"> = {
    source: input.source,
    source_refs: input.source_refs ?? null,
    source_snapshot: snapshot,
    name_ko: input.name_ko.trim(),
    name_en: input.name_en.trim(),
    wine_type: wineType,
    wine_style: input.wine_style?.trim() || null,
    country_ko: countryRes.ko ?? input.country.trim(), // NOT NULL 보장
    region_ko: regionRes.ko,
    producer: producerRes.en,
    grape_varieties: grapeRes.ko,
    alcohol: alcoholNum,
    // grape_blend는 마지막 섹션에서 채움 (타입 순서)
    brand: input.brand?.trim() || null,
    price: input.price ?? null,
    description: input.description?.trim() || null,
    image_url: input.image_url ?? null,
    is_published: input.is_published ?? true,
    search_query_en: null, // 추후 검색 인프라 단계
    locked_fields: input.locked_fields ?? null,
    needs_review: reasons.length > 0,
    needs_review_reasons: reasons.length > 0 ? reasons : null,
    grape_blend: grapeRes.blend.length > 0 ? grapeRes.blend : null,
  };

  const vivinoRow = buildVivinoRow(input.vivino);
  // vivino input은 있는데 url 검증 실패 → 어드민 검수
  if (input.vivino && !vivinoRow) {
    reasons.push(`vivino:invalid_url`);
    wineRow.needs_review = true;
    wineRow.needs_review_reasons = reasons;
  }

  return {
    ok: true,
    wineRow,
    vivinoRow,
    needs_review_reasons: reasons,
  };
}

function isValidVivinoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const s = url.trim();
  return s.length > 0 && s.toLowerCase().includes("vivino.com");
}

function buildVivinoRow(v: VivinoInput | null | undefined): Omit<VivinoWineRow, "wine_id"> | null {
  if (!v || !isValidVivinoUrl(v.url)) return null;
  const autoReviewed = typeof v.match_score === "number" && v.match_score >= 0.9;
  return {
    vivino_url: v.url.trim(),
    vivino_wine_id: v.wine_id != null ? String(v.wine_id) : null,
    vivino_name: v.name?.trim() || null,
    rating: v.rating ?? null,
    reviews: v.reviews ?? null,
    winery: v.winery?.trim() || null,
    grapes: v.grapes?.trim() || null,
    region: v.region?.trim() || null,
    style: v.style?.trim() || null,
    alcohol: v.alcohol?.trim() || null,
    description: v.description?.trim() || null,
    allergens: v.allergens?.trim() || null,
    image_url: v.image_url ?? null,
    needs_review: !autoReviewed,
    reviewed_at: autoReviewed ? new Date().toISOString() : null,
    match_score: v.match_score ?? null,
    scraped_at: v.scraped_at ?? null,
    raw_payload: v.raw_payload ?? null,
  };
}

/**
 * UPDATE 진입점.
 * @param current 현재 wines_v2 row (locked_fields 보호용)
 * @param patch 변경할 필드만 (Partial)
 * @param opts.fillEmptyOnly 빈 필드만 채움 (autoMerge용)
 */
export async function buildUpdatePatch(
  sb: SupabaseClient,
  current: Pick<
    WinesV2Row,
    | "name_ko"
    | "name_en"
    | "wine_type"
    | "wine_style"
    | "country_ko"
    | "region_ko"
    | "producer"
    | "grape_varieties"
    | "grape_blend"
    | "alcohol"
    | "brand"
    | "price"
    | "description"
    | "image_url"
    | "locked_fields"
    | "source_refs"
    | "source_snapshot"
  >,
  patch: Partial<WinesV2Input>,
  opts: { fillEmptyOnly?: boolean; dict?: TermDictLookup } = {},
): Promise<UpdateResult> {
  const d = opts.dict ?? (await loadTermDict(sb));
  const fillEmpty = opts.fillEmptyOnly === true;
  const locked = new Set(current.locked_fields ?? []);
  const reasons: string[] = [];

  // 빈 필드 판정 helper
  const isEmpty = (v: unknown) =>
    v == null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

  // 필드별 처리
  const update: Partial<WinesV2Row> = {};

  const setField = <K extends keyof WinesV2Row>(key: K, value: WinesV2Row[K]) => {
    if (locked.has(key as string)) return; // locked 보호
    if (fillEmpty && !isEmpty(current[key as keyof typeof current])) return;
    update[key] = value;
  };

  if ("name_ko" in patch && patch.name_ko != null) {
    setField("name_ko", patch.name_ko.trim());
  }
  if ("name_en" in patch && patch.name_en != null) {
    setField("name_en", patch.name_en.trim());
  }
  if ("wine_type" in patch) {
    setField("wine_type", normalizeWineTypeEnum(patch.wine_type));
  }
  if ("wine_style" in patch) {
    setField("wine_style", patch.wine_style?.trim() || null);
  }
  if ("country" in patch && patch.country) {
    // country는 NOT NULL이라 patch에서 빈/null 들어오면 무시 (UPDATE에서 country를 NULL로 만드는 건 불가)
    const r = translateRegionToKo("country", patch.country, d);
    if (r.unknown) reasons.push(`country:${patch.country}`);
    setField("country_ko", r.ko ?? patch.country.trim());
  }
  if ("region" in patch) {
    const r = translateRegionToKo("region", patch.region, d);
    if (r.unknown) reasons.push(`region:${patch.region}`);
    setField("region_ko", r.ko);
  }
  if ("producer" in patch) {
    const p = translateProducer(patch.producer, d);
    if (p.unknown) reasons.push(`producer:${patch.producer ?? ""}`);
    setField("producer", p.en);
  }
  if ("grape_varieties" in patch && Array.isArray(patch.grape_varieties)) {
    const g = translateGrapesToKo(patch.grape_varieties, d);
    for (const u of g.unknowns) reasons.push(`grape:${u}`);
    setField("grape_varieties", g.ko);
    setField("grape_blend", g.blend.length > 0 ? g.blend : null);
  }
  if ("alcohol" in patch) {
    setField("alcohol", parseAlcoholNumeric(patch.alcohol));
  }
  if ("brand" in patch) {
    setField("brand", patch.brand?.trim() || null);
  }
  if ("price" in patch) {
    setField("price", patch.price ?? null);
  }
  if ("description" in patch) {
    setField("description", patch.description?.trim() || null);
  }
  if ("image_url" in patch) {
    setField("image_url", patch.image_url ?? null);
  }
  if ("is_published" in patch && typeof patch.is_published === "boolean") {
    setField("is_published", patch.is_published);
  }

  // source_refs: 누적 (덮어쓰지 않음)
  if (Array.isArray(patch.source_refs) && patch.source_refs.length > 0) {
    const cur = current.source_refs ?? [];
    const merged = Array.from(new Set([...cur, ...patch.source_refs]));
    if (merged.length > cur.length) update.source_refs = merged;
  }

  // source_snapshot: 부분 머지 (소스별 키만 갱신)
  if (patch.legacy) {
    const src = patch.source ?? ("admin" as WineSource);
    const next = buildSourceSnapshot(src, patch.legacy);
    if (next) {
      const merged = { ...(current.source_snapshot ?? {}), ...next };
      update.source_snapshot = merged;
    }
  }

  if (reasons.length > 0) {
    update.needs_review = true;
    update.needs_review_reasons = reasons;
  }

  // vivino 분기
  let vivinoUpsert: Omit<VivinoWineRow, "wine_id"> | null = null;
  let vivinoDelete = false;
  if ("vivino" in patch) {
    if (patch.vivino === null) {
      vivinoDelete = true;
    } else if (patch.vivino) {
      vivinoUpsert = buildVivinoRow(patch.vivino);
      // url 검증 실패 — 어드민 검수
      if (!vivinoUpsert) {
        reasons.push(`vivino:invalid_url`);
        update.needs_review = true;
        update.needs_review_reasons = reasons;
      }
    }
  }

  return {
    wineUpdate: update,
    vivinoUpsert,
    vivinoDelete,
    needs_review_reasons: reasons,
  };
}
