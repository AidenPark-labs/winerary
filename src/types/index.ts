export type Visibility = 'private' | 'link' | 'public'

export type WineType = 'red' | 'white' | 'rose' | 'sparkling' | 'fortified' | 'dessert' | 'other'

export type WineSource =
  | 'wine21'
  | 'winenara'
  | 'gangnam'
  | 'naver_shopping'
  | 'user_submission'
  | 'admin'

/**
 * v5 와인 정규 타입 (wines_v2 → swap 후 wines).
 * 단일 표준 언어로 정규화됨:
 *   - country_ko / region_ko / grape_varieties: 한글
 *   - producer / wine_style / brand: 영문 단일
 *   - wine_type: 영문 enum
 *
 * Vivino 데이터는 별도 vivino_wines 테이블 (선택적 join).
 *
 * 관련: docs/wines-schema-simplification.md §3.1
 *      memory/project_v5_normalization_decisions.md
 */
export interface Wine {
  id: string
  source: WineSource
  source_refs: string[] | null
  source_snapshot: Record<string, unknown> | null

  // 이름 (이중)
  name_ko: string
  name_en: string

  // 분류
  wine_type: WineType
  wine_style: string | null

  // 지리 (한글)
  country_ko: string                // NOT NULL
  region_ko: string | null

  // 와이너리 (영문 단일)
  producer: string | null

  // 와인 정보
  grape_varieties: string[]         // 한글, 프랑스식 발음
  grape_blend: GrapeBlendItem[] | null
  alcohol: number | null
  brand: string | null
  price: number | null

  // 서빙
  description: string | null
  image_url: string | null
  is_published: boolean

  // 옵셔널 join — vivino_wines 데이터
  vivino?: VivinoWine | null

  created_at: string
  updated_at: string
}

export interface GrapeBlendItem {
  grape: string                     // 한글 표준 (term_dict 매칭 시) 또는 원문
  percent: number                   // 0~100
}

/**
 * vivino_wines 행 (Vivino 매칭 결과).
 * 유저 노출 조건: reviewed_at IS NOT NULL일 때만 표시.
 */
export interface VivinoWine {
  wine_id: string
  vivino_url: string
  vivino_wine_id: string | null
  vivino_name: string | null
  rating: number | null
  reviews: number | null
  winery: string | null
  grapes: string | null
  region: string | null
  style: string | null
  alcohol: string | null
  description: string | null
  allergens: string | null
  image_url: string | null
  needs_review: boolean
  reviewed_at: string | null
  match_score: number | null
}

export interface WineRecord {
  id: string
  user_id: string
  wine_id: string | null
  pending_wine_id: string | null
  wine_vintage: number | null
  photos: string[]
  place_name: string | null
  latitude: number | null
  longitude: number | null
  drunk_at: string
  companions: string[] | null
  price: number | null
  price_type: 'market' | 'retail' | null
  price_unit: 'bottle' | 'glass' | null
  foods: FoodRecord[]
  tags: string[] | null
  visibility: Visibility
  invite_code: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string

  override_wine_type: WineType | null
  override_country: string | null
  override_country_ko: string | null
  override_region: string | null
  override_region_ko: string | null
  override_grape_varieties: string[] | null
  override_grape_varieties_ko: string[] | null
  override_alcohol: number | null

  name: string
  wine_name_original: string | null
  wine_vivino_url: string | null
  wine_type: WineType | null
  grape_variety: string | null                // legacy (단수 string, 호환용)
  grape_varieties: string[] | null            // 표준 배열 (영문 정규화)
  grape_varieties_ko: string[] | null         // 표준 배열 (한글 프랑스식)
  wine_country: string | null
  location: string | null
  memo: string | null
  rating: number | null
  pairing_score: number | null
  value_score: number | null
  repurchase_intent: 'yes' | 'maybe' | 'no' | null
}

export interface WineRecordEnriched {
  id: string
  user_id: string
  wine_id: string | null
  pending_wine_id: string | null
  wine_vintage: number | null
  photos: string[]
  place_name: string | null
  latitude: number | null
  longitude: number | null
  drunk_at: string
  companions: string[] | null
  price: number | null
  price_type: 'market' | 'retail' | null
  price_unit: 'bottle' | 'glass' | null
  foods: FoodRecord[]
  tags: string[] | null
  visibility: Visibility
  invite_code: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string

  wine_name_ko: string | null
  wine_name_en: string | null
  producer_ko_display: string | null
  producer_en_display: string | null
  wine_type_display: WineType | null
  country_display: string | null
  region_display: string | null
  grape_varieties_display: string[] | null
  style_display: string | null
  image_url: string | null
  is_catalog_wine: boolean

  rating: number | null
  value_score: number | null
  pairing_score: number | null
  repurchase_intent: 'yes' | 'maybe' | 'no' | null
  evaluation_memo: string | null
}

/**
 * @deprecated v5에서는 {@link Wine} + {@link VivinoWine} 사용.
 * Phase 4 코드 전환 진행 중 — 호출자 점진 전환 후 제거 예정.
 */
export interface WineDisplay {
  id: string
  name_ko: string
  name_en: string | null
  producer_ko: string | null
  producer_en: string | null
  wine_type: WineType | null
  country_display: string | null
  region_display: string | null
  grape_varieties_display: string[] | null
  style_display: string | null
  image_url: string | null
  vivino_url: string | null
  vivino_rating: number | null
  vivino_reviews: number | null
  naver_link: string | null
  country: string | null
  region_path: string | null
  grape_varieties: string[] | null
  wine_style: string | null
  source: string | null
  source_refs: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface Evaluation {
  id: string
  record_id: string
  wine_id: string | null
  pending_wine_id: string | null
  user_id: string | null
  nickname: string | null
  role: 'owner' | 'guest'
  rating: number | null
  value_score: number | null
  pairing_score: number | null
  repurchase_intent: 'yes' | 'maybe' | 'no' | null
  memo: string | null
  created_at: string
  updated_at: string
}

export interface FoodRecord {
  name: string
  note?: string
}

export interface CompanionEntry {
  name: string
  userCode: string | null
}

export interface RecordMention {
  id: string
  record_id: string
  mentioned_user_id: string
  created_at: string
  profile?: {
    nickname: string
    avatar_url: string | null
    user_code: string
  }
}

/**
 * @deprecated v3 재설계로 `evaluations` 테이블로 이관됨. 신규 코드는 {@link Evaluation} 사용.
 * 기존 참조 경로만 일시 유지.
 */
export interface RecordEvaluation {
  id: string
  record_id: string
  user_id: string
  rating: number | null
  value_score: number | null
  pairing_score: number | null
  memo: string | null
  repurchase_intent: string | null
  created_at: string
  updated_at: string
  nickname?: string
}

export interface LinkedRecord {
  record_id: string
  wine_name: string
  photos: string[]
  rating: number | null
  value_score: number | null
  pairing_score: number | null
  memo: string | null
  repurchase_intent: string | null
  drunk_at: string
  owner_id: string
  owner_nickname: string
}

export type WineReportType = 'vivino_link' | 'wine_name' | 'other_info' | 'custom'
export type WineReportStatus = 'open' | 'resolved' | 'dismissed'

export interface WineReport {
  id: string
  wine_id: string
  user_id: string | null
  report_type: WineReportType
  description: string | null
  status: WineReportStatus
  created_at: string
  resolved_at: string | null
  resolved_by: string | null
  resolved_note: string | null
}

export interface WineSuggestion {
  wine_id?: string
  name: string
  name_ko: string
  producer: string
  country: string
  type: string
  grapes: string
  vintage_range: string
  vivino_url: string | null
}
