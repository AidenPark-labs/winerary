# wines 스키마 단순화·정규화 (v5) — wines_v2 신설 전략

> **상태**: 📋 **계획 단계**. 실행 시작 전 마지막 검토 단계.
> 이 문서는 다음 세션이 컨텍스트 없이도 이어받을 수 있도록 작성됨.
> 마지막 업데이트: 2026-04-28

---

## 0. 변경 사항 (이전 계획과의 차이)

이전 계획(2026-04-24까지)은 **in-place 8 사이클 + DROP**이었다.
2026-04-28 사용자 결정으로 **`wines_v2` 신설 → backfill·정규화 → swap** 전략으로 전환.

**차이점:**
- 사이클별 점진 변경 → 한 번의 일괄 변환
- DROP 위험 8회 → 1회 (swap)
- 검증: 사이클별 grep + 1주 관찰 → 두 테이블 직접 비교
- 코드 수정: 분산 → 한 PR로 묶음
- `phase-29-vivino-separation-checklist.md`는 **이 문서에 통합** (별도 진행 안 함)

---

## 1. 배경

### 왜 이 작업이 필요한가

DB 재설계 v3~v4를 거치면서 wines 테이블에 동일 개념의 중복 컬럼이 누적, 그 위에 언어 혼재(한·영·혼재)까지 쌓였다. 결과:

- 60+ 컬럼 중 절반이 같은 개념 표현 → 어느 컬럼 읽을지 매번 혼동
- `wine-display.ts`에 긴 fallback 체인
- promote/merge/edit 코드 분기 폭발
- 같은 컬럼 안에서 한·영·혼재 데이터 공존 (예: `producer` 한 17K + 영 303 + 혼재 1,386)

### 목표

1. **컬럼 수: 62 → 약 27** (vivino_wines 분리 후)
2. **각 컬럼이 단일 표준 언어** (한 또는 영, 일관)
3. **한 backfill 스크립트에서 변환·통합·정규화 일괄 수행**
4. **swap으로 끝** — 기존 wines는 `wines_old`로 보존

---

## 2. 확정된 정규화 정책

### 2.1 컬럼별 표준 언어

| 영역 | 컬럼 | 표준 |
|---|---|---|
| 이름 | `name_ko` / `name_en` | **이중 유지** (한+영) |
| 분류 | `wine_type` | 영문 enum |
| 분류 | `wine_style` | **영문** (Vivino 식별자, 표시는 매핑) |
| 지리 | `country_ko` | 한글 |
| 지리 | `region_ko` | 한글 |
| 와이너리 | `producer` | **영문 단일** (표시 일관성 + 데이터 92.5% 즉시 사용 가능) |
| 품종 | `grape_varieties` (text[]) | **한글** (프랑스식 발음) |
| 와인 정보 | `alcohol` | numeric (단위 정제) |
| 와인 정보 | `brand` | 영문 |
| 서빙 | `description` | 한글 |

근거: `memory/project_v5_normalization_decisions.md`

#### 2.1.1 한글 표기 정책 (2026-04-29 확정)

**규칙:** 영어식 발음 X. 와인 출신 국가의 원어 발음 기반 한글로 표기. 한국 와인 업계 관용 표기가 명확히 다르면 관용 우선.

| 영문 | 출신어 한글 (사용) | 비고 |
|---|---|---|
| Burgundy | 부르고뉴 | 프랑스 Bourgogne |
| Tuscany | 토스카나 | 이탈리아 Toscana |
| Tokay | 토커이 | 헝가리 Tokaj |
| Cabernet Sauvignon | 까베르네 소비뇽 | 프랑스식 |
| Champagne (와인) | **샴페인** | 한국 관용 우선 |
| Champagne (지역) | 샹파뉴 | 출신어 |
| Cognac | **코냑** | 한국 관용 우선 |

**적용:** term_dict 등록 데이터 + LLM 변환 프롬프트 모두에 반영.
**관련 메모리:** `feedback_ko_pronunciation_native_origin.md`

### 2.2 변환 자원

| 자원 | 용도 | 규모 |
|---|---|---|
| `term_dict` | 영↔한 매핑 사전 (1차) | 2,317건 |
| LLM 번역 | 사전 미커버분 (2차) | — |
| `needs_review` 플래그 | 변환 모호 케이스 (3차, 어드민 검수) | — |

### 2.3 변환 예상 규모

| 변환 | 건수 |
|---|---|
| 품종 영문 → 한글 | 약 18,000 |
| 지역 영문/혼재 → 한글 | 약 1,529 |
| producer 한글값 → producer_en 영문 변환 | 약 300 |
| alcohol 텍스트("13.5%") → numeric | ~9,500 |

---

## 3. 최종 스키마

### 3.1 `wines_v2` (29컬럼)

```sql
-- ENUM 타입 (오타 차단)
CREATE TYPE wine_source AS ENUM (
  'wine21', 'winenara', 'gangnam', 'naver_shopping', 'user_submission', 'admin'
);

CREATE TABLE wines_v2 (
  -- 식별 (6)
  id              uuid PRIMARY KEY,                    -- wines.id 그대로 유지
  source          wine_source NOT NULL,                -- ENUM
  source_refs     uuid[],
  source_snapshot jsonb,                               -- 소스별 원본 스냅샷
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- 이름 (2)
  name_ko         text NOT NULL,                       -- UNIQUE
  name_en         text NOT NULL,

  -- 분류 (2)
  wine_type       text NOT NULL,                       -- enum: red/white/sparkling/rose/dessert/fortified/other (CHECK)
  wine_style      text,                                -- 영문 (예: "Burgundy Côte de Nuits Red")

  -- 지리 (2) — 한글
  country_ko      text NOT NULL,                       -- 필수 (v3 정책: 와인 진입 4필드)
  region_ko       text,                                -- NULL 허용 (와인마다 정보 깊이 다름, finest level)

  -- 와이너리 (1) — 영문 단일
  producer        text,                                -- 영문 canonical

  -- 와인 정보 (5)
  grape_varieties text[],                              -- 한글, 프랑스식 발음 (이름만)
  grape_blend     jsonb,                               -- 비율 정보 [{grape, percent}]
  alcohol         numeric(4,2),
  brand           text,                                -- 영문
  price           integer,                             -- CHECK >= 0

  -- 서빙 (3)
  description     text,                                -- 한글
  image_url       text,
  is_published    boolean NOT NULL DEFAULT true,

  -- 검색 (5)
  search_tsv      tsvector,                            -- 트리거 자동 빌드
  search_jamo     text,
  embedding       vector(1536),
  embedded_at     timestamptz,
  search_query_en text,                                -- Vivino 검색용 영문 쿼리

  -- 어드민 (1)
  locked_fields   text[],                              -- 어드민이 수동 수정한 필드명 보호

  -- 변환 검수 (2)
  needs_review        boolean NOT NULL DEFAULT false,
  needs_review_reasons text[],                         -- ["grape:Carmenère", "vivino:invalid_url"]

  -- 제약
  CONSTRAINT wines_v2_wine_type_check
    CHECK (wine_type IN ('red','white','sparkling','rose','dessert','fortified','other')),
  CONSTRAINT wines_v2_price_nonneg
    CHECK (price IS NULL OR price >= 0),
  CONSTRAINT wines_v2_name_ko_unique
    UNIQUE (name_ko)
);

-- 인덱스
CREATE INDEX wines_v2_search_tsv_idx ON wines_v2 USING gin(search_tsv);
CREATE INDEX wines_v2_search_jamo_idx ON wines_v2 USING gin(search_jamo gin_trgm_ops);
CREATE INDEX wines_v2_embedding_idx ON wines_v2 USING ivfflat(embedding vector_cosine_ops);
CREATE INDEX wines_v2_source_idx ON wines_v2(source);
CREATE INDEX wines_v2_country_region_idx ON wines_v2(country_ko, region_ko);
CREATE INDEX wines_v2_producer_idx ON wines_v2(producer) WHERE producer IS NOT NULL;
CREATE INDEX wines_v2_is_published_idx ON wines_v2(is_published);
CREATE INDEX wines_v2_needs_review_idx ON wines_v2(needs_review) WHERE needs_review = true;

-- 트리거: search_tsv 자동 빌드 (name_ko/name_en/producer/region_ko/country_ko/grape_varieties/wine_style/brand 변경 시)
-- 가중치: A=name, B=producer, C=region/country, D=grape/style/brand
```

### 3.2 `vivino_wines` (20컬럼, 신설)

```sql
CREATE TABLE vivino_wines (
  -- 식별: wine_id 자체가 PK (wines_v2와 1:1, FK 없음 — 독립 레이어 원칙)
  wine_id        uuid PRIMARY KEY,

  -- Vivino 식별
  vivino_url     text NOT NULL UNIQUE,
  vivino_wine_id text,
  vivino_name    text,

  -- 메트릭
  rating         numeric(2,1),                            -- CHECK 0~5
  reviews        integer,                                 -- CHECK >= 0

  -- 상세 (Vivino 원본, 영문 그대로)
  winery         text,
  grapes         text,
  region         text,
  style          text,
  alcohol        text,
  description    text,
  allergens      text,
  image_url      text,

  -- 검수
  needs_review   boolean NOT NULL DEFAULT false,
  reviewed_at    timestamptz,
  match_score    numeric,                                 -- CHECK 0~1

  -- 운영
  scraped_at     timestamptz,
  raw_payload    jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- 제약
  CONSTRAINT vivino_wines_rating_range
    CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
  CONSTRAINT vivino_wines_reviews_nonneg
    CHECK (reviews IS NULL OR reviews >= 0),
  CONSTRAINT vivino_wines_match_score_range
    CHECK (match_score IS NULL OR (match_score >= 0 AND match_score <= 1))
);

-- wine_id는 PK라 자동 인덱스
CREATE INDEX vivino_wines_needs_review_idx ON vivino_wines(needs_review) WHERE needs_review = true;
CREATE INDEX vivino_wines_reviewed_at_idx ON vivino_wines(reviewed_at) WHERE reviewed_at IS NOT NULL;
```

**관계**: `wines_v2` 1 : 0..1 `vivino_wines` (wine_id PK, FK 없음 — 독립 레이어)
**유저 노출 조건**: `vivino_wines.reviewed_at IS NOT NULL`일 때만 표시
**URL 검증**: 변환 모듈이 `vivino.com` 도메인 + 빈 값 체크. 실패 시 vivino_wines 미생성 + wines_v2.needs_review=true

### 3.3 `source_snapshot` jsonb 스키마

```jsonc
{
  "wine21": {
    "wine_idx": 12345,
    "winery_idx": 678,
    "review_image_url": "...",
    "raw_alcohol_text": "13.5%",
    "vintage": "2018"
  },
  "naver": {
    "link": "https://...",
    "image": "https://..."
  },
  "gangnam": {
    "branduid": "...",
    "raw_alcohol_text": "..."
  },
  "winenara": { ... },
  "user_submission": { ... }
}
```

---

## 4. 컬럼 통합·변환 매핑 (62 → wines_v2 + vivino_wines)

### 4.1 우선순위 fallback (모든 컬럼 공통)

```
final_*           (어드민 수동 override, 최우선)
  ↓
정규 컬럼          (현재 메인 컬럼)
  ↓
*_ko / *_en       (언어 변형)
  ↓
vivino_*          (Vivino 출처)
  ↓
소스별 컬럼        (gangnam_alcohol 등)
```

### 4.2 매핑 표

| → wines_v2 | 통합·이관 대상 | 변환 |
|---|---|---|
| `id` | `wines.id` | 그대로 |
| `source` | `wines.source`, `wines.data_source` | 둘 중 하나 |
| `name_ko` | `wines.name_ko` | 그대로 |
| `name_en` | `wines.name_en` | 그대로 |
| `wine_type` | `final_wine_type → wine_type` | enum 검증 |
| `wine_style` | `final_style → wine_style → vivino_style` | 한글값(`wine_style_ko`) 폐기 |
| `country_ko` | `final_country → country_ko → country` | **NOT NULL**. 변환 불필요 (이미 한글). 영문 미커버는 그대로 통과 + needs_review |
| `region_ko` | `final_region → region_ko → region → region_path` | NULL 허용. path 분해 후 finest부터 매칭, fallback up. 영문 미커버 → NULL + needs_review |
| `producer` (영문 단일) | `producer_en → winery_en_clean → vivino_winery → producer/producer_ko (영문이면)` | 한글값 → 영문 LLM 변환 |
| `grape_varieties` | `final_grapes → grape_varieties_ko → grape_varieties → grape_variety` | **영문 → 한글 변환** (가장 큼). 비율 정보는 `grape_blend`로 분리 |
| `grape_blend` | grape 입력 항목의 비율 추출 | jsonb [{grape, percent}] |
| `alcohol` | `final_alcohol → alcohol → vivino_alcohol → gangnam_alcohol` | 텍스트 → numeric |
| `brand` | `wines.brand` | 그대로 |
| `price` | `wines.price` | 그대로 |
| `description` | `final_description → description` | 그대로 (한글) |
| `image_url` | `wines.image_url → naver_image` | 그대로 |
| `is_published` | `wines.is_published` | 그대로 |
| `search_tsv` | — | 트리거로 재생성 |
| `search_jamo` | — | 재계산 스크립트 |
| `embedding` | — | 재계산 (정규 컬럼 기반) |
| `embedded_at` | — | NULL로 시작 |
| `search_query_en` | `wines.search_query_en` | 그대로 |
| `locked_fields` | `wines.locked_fields` | 그대로 |
| `needs_review` | — | 변환 모듈 결과 (모호한 변환 있으면 true) |
| `needs_review_reasons` | — | 변환 모듈이 채움 (`["grape:X", "vivino:invalid_url"]`) |
| `source_refs` | `wines.source_refs` | 그대로 |
| `source_snapshot` | `wines.source_snapshot` + naver/gangnam/wine21 컬럼 흡수 | **재구조화** |

### 4.3 별도 jsonb로 이동

| 원래 컬럼 | → 위치 |
|---|---|
| `naver_link`, `naver_image` | `source_snapshot.naver` |
| `gangnam_alcohol` | `source_snapshot.gangnam.raw_alcohol_text` (alcohol 정규화 후 보조 정보로) |
| `review_image_url` | `source_snapshot.wine21.review_image_url` |

### 4.4 `vivino_wines`로 분리

| wines.vivino_* | → vivino_wines.* |
|---|---|
| `vivino_url` | `vivino_url` |
| `vivino_wine_id` | `vivino_wine_id` |
| `vivino_name` | `vivino_name` |
| `vivino_rating` | `rating` |
| `vivino_reviews` | `reviews` |
| `vivino_winery` | `winery` |
| `vivino_grapes` | `grapes` |
| `vivino_region` | `region` |
| `vivino_style` | `style` |
| `vivino_alcohol` | `alcohol` |
| `vivino_description` | `description` |
| `vivino_allergens` | `allergens` |
| `vivino_needs_review` | `needs_review` |
| `vivino_reviewed_at` | `reviewed_at` |

### 4.5 완전 폐기 (`final_*` 8개)

`final_grapes`, `final_region`, `final_country`, `final_producer`, `final_wine_type`, `final_alcohol`, `final_style`, `final_description`

→ wines_v2의 정규 컬럼에 흡수 (우선순위 1순위로). 어드민 수동 수정은 이후 `locked_fields` 메커니즘으로 보호.

### 4.6 통합 변환 모듈 (`src/lib/wines-v2-transform.ts`)

> ⚠️ **이게 v5의 핵심**. 모든 INSERT/UPDATE 진입점이 이 모듈을 호출해야 변환 로직 일관성 유지. 지금 코드는 promote-raw-wine, admin/wines/actions, vivino-review/actions 각자에 변환 로직이 흩어져 있음.

#### 책임
1. 입력 → wines_v2 row + (있으면) vivino_wines row로 분리
2. 한·영 양방향 변환 (term_dict 1차 → LLM 2차 → 실패 시 needs_review)
3. enum/numeric 정규화 (wine_type, alcohol)
4. source_snapshot jsonb 빌드 (naver/gangnam/wine21/winenara)
5. UPDATE 시 빈 필드 채움 + locked_fields 보호

#### 시그니처

```typescript
// 메인 입력 인터페이스
export interface WinesV2Input {
  source: 'wine21' | 'winenara' | 'gangnam' | 'naver_shopping' | 'user_submission' | 'admin';
  source_refs?: string[];

  // 필수 — v3 정책 4필드 (빈 값이면 transformInput이 ok:false 반환)
  name_ko: string;
  name_en: string;
  country: string;             // 한·영 모두 허용. 모듈이 한글로 변환 (영문 미커버는 그대로 통과 + needs_review)
  // grape_varieties 1개 이상도 필수

  wine_type?: string | null;   // enum 자동 정규화 (외 값은 'other')
  wine_style?: string | null;  // 영문, trim 후 그대로 저장

  // 옵셔널
  region?: string | null;      // 한·영·path 모두 허용. NULL 허용
  producer?: string | null;    // 영문 권장. 한글 입력은 LLM 단계 대상

  // 한·영 모두 허용. 한글 배열로 정규화 + 비율은 grape_blend로 분리
  grape_varieties?: string[] | null;

  alcohol?: string | number | null;
  brand?: string | null;
  price?: number | null;
  description?: string | null;
  image_url?: string | null;
  is_published?: boolean;
  locked_fields?: string[];

  // Vivino 데이터 — 있으면 vivino_wines로 분기. url 검증 (vivino.com 도메인)
  vivino?: VivinoInput | null;

  // source_snapshot 후보 데이터 — 모듈이 흡수
  legacy?: {
    naver_link?: string;
    naver_image?: string;
    gangnam_alcohol?: string;
    review_image_url?: string;
    raw_payload?: Record<string, unknown>;
  };
}

export interface VivinoInput {
  url: string;                 // canonical, vivino.com 도메인 강제
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
  match_score?: number | null; // >= 0.9면 autoReviewed
  scraped_at?: string | null;
  raw_payload?: Record<string, unknown> | null;
}

// 결과: discriminated union — 호출자는 ok 필드로 분기
export type TransformResult =
  | {
      ok: true;
      wineRow: Omit<WinesV2Row, 'id' | 'created_at' | 'updated_at'>;
      vivinoRow: Omit<VivinoWineRow, 'wine_id'> | null;
      needs_review_reasons: string[]; // ["grape:X", "vivino:invalid_url"]
    }
  | { ok: false; error: string };  // 필수 필드 누락 시

// === 메인 진입 ===

// INSERT용 — 모든 신규 와인 진입 (promote, admin direct, pending 승인, api/admin/records)
export async function transformInput(
  sb: SupabaseClient,
  input: WinesV2Input,
  dict?: TermDictLookup,         // 배치 처리 시 미리 로드해서 재사용
): Promise<TransformResult>;

// UPDATE용 — 어드민 편집, autoMerge, vivino-review, dedupe-review
export async function buildUpdatePatch(
  sb: SupabaseClient,
  current: Pick<WinesV2Row, 'locked_fields' | 'name_ko' | 'name_en' | 'country_ko' | /* ... */>,
  patch: Partial<WinesV2Input>,
  opts?: { fillEmptyOnly?: boolean; dict?: TermDictLookup }, // autoMerge는 fillEmptyOnly=true
): Promise<{
  wineUpdate: Partial<WinesV2Row>;
  vivinoUpsert: Omit<VivinoWineRow, 'wine_id'> | null;
  vivinoDelete: boolean;
  needs_review_reasons: string[];
}>;

// === 변환 단위 (단독 호출 가능, backfill 스크립트도 사용) ===

export async function translateGrapesToKo(
  grapes: string[], dict: TermDict, llm?: LLMClient,
): Promise<{ ko: string[]; unknowns: string[] }>;

export async function translateRegionToKo(
  region: string, dict: TermDict, llm?: LLMClient,
): Promise<{ ko: string | null; unknown: boolean }>;

export async function translateProducer(
  producer: string, dict: TermDict, llm?: LLMClient,
): Promise<{ ko: string | null; en: string | null; unknown: boolean }>;

export function normalizeWineTypeEnum(v: string | null | undefined): string;
export function parseAlcoholNumeric(v: string | number | null | undefined): number | null;
export function buildSourceSnapshot(input: WinesV2Input): Record<string, unknown> | null;
```

#### 실패 처리
- term_dict 미커버 + LLM 실패 → `needs_review = true` + `needs_review_reasons.push("grape:Carmenère")` 같은 식
- swap 후에도 어드민이 수정 가능 — 변환 실패가 INSERT 차단하지는 않음 (precision 우선이지만 매칭 자체는 보존)
- 단 **필수 필드 누락** (name_ko/name_en/country/grape) 시는 `ok: false` 반환 → wines_v2 진입 거부

#### 변환 정책 요약 (필드별)

| 필드 | 매칭 성공 | 매칭 실패 (영문) | 매칭 실패 (한글) |
|---|---|---|---|
| `country_ko` (NOT NULL) | 표준 한글 | 영문 그대로 통과 + needs_review | 그대로 통과 |
| `region_ko` (NULL 허용) | 표준 한글 | NULL + needs_review | 그대로 통과 |
| `grape_varieties` (한글 배열) | 표준 한글 | unknowns + needs_review (LLM 단계) | 그대로 통과 |
| `producer` (영문 단일) | 표준 영문 | 그대로 통과 (정상 영문) | NULL + needs_review (LLM 단계) |
| `wine_type` | enum 7종 매칭 | — (외 값은 'other') | — |
| `wine_style` | trim | trim 후 그대로 | trim 후 그대로 |
| `alcohol` | numeric (0~30) | NULL (파싱 실패·범위 밖) | — |
| `vivino.url` | vivino.com 도메인 강제 | vivino_wines 미생성 + needs_review | 동일 |

#### Path·괄호·비율 처리
- region path: 구분자 `/`, `>` (콤마 미인식). 가장 뒤가 finest. 매칭 안 되면 한 단계씩 위로 (fallback up).
- 괄호 노트: 각 part에 `stripParenthetical` 자동 적용 (예: `"뻬르낭-베르즐레스(Pernand-Vergelesses)"` → `"뻬르낭-베르즐레스"`)
- grape 비율: `"Cabernet Sauvignon 60%"` 같은 패턴(앞·뒤·괄호) 인식 → 이름은 `grape_varieties`, 비율은 `grape_blend`로 분리

#### 변환 모듈이 흡수하는 기존 로직
- `src/lib/grape-normalize.ts`의 `normalizeGrapes` → `translateGrapesToKo` 안에 통합 (기존 함수는 wines_v2 backfill 끝나면 폐기)
- `admin/wines/actions.ts:loadTermDict + lookup` → 모듈 안으로
- `admin/wines/actions.ts:inferWineTypeFromStyle` → 모듈 안으로
- `promote-raw-wine.ts:normalizeWineType / extractGrapes / buildVivinoFields` → 모듈 안으로

### 4.7 Write 경로별 변환 매핑

| 경로 | 함수 | v5 변환 모듈 호출 | vivino 분리 |
|---|---|---|---|
| `lib/promote-raw-wine.ts` | `promoteSingleRawWine` (raw → wines INSERT) | `transformInput(rawToInputAdapter(raw))` | 자동 (vivinoRow) |
| `lib/promote-raw-wine.ts` | `autoMerge` (빈 필드 채움) | `buildUpdatePatch(target, raw, { fillEmptyOnly: true })` | 자동 (vivinoUpsert) |
| `lib/promote-raw-wine.ts` | `insertWineDirectly` (어드민 직접) | `transformInput(input)` | 자동 |
| `admin/wines/actions.ts` | `updateWine` (일반 편집) | `buildUpdatePatch(current, patch)` | — |
| `admin/wines/actions.ts` | `updateWineVivino` (Vivino 입력 + 자동 보강) | `buildUpdatePatch(current, { vivino, ...derivedFields })` | 자동 (vivinoUpsert) |
| `admin/wines/actions.ts` | `clearWineVivino` | `buildUpdatePatch(current, { vivino: null })` | 자동 (vivinoDelete) |
| `admin/wines/actions.ts` | `deleteWine` | wines_v2 + vivino_wines 동시 DELETE | 직접 |
| `admin/vivino-review/actions.ts` | `updateWineFields` (일반 편집) | `buildUpdatePatch(current, patch)` | — |
| `admin/vivino-review/actions.ts` | `confirmVivinoMatch` | `vivino_wines.update({ needs_review: false, reviewed_at: now })` | 직접 (단순) |
| `admin/vivino-review/actions.ts` | `replaceVivinoUrl` (재크롤링) | `buildUpdatePatch(current, { vivino: crawled })` | 자동 (vivinoUpsert) |
| `admin/vivino-review/actions.ts` | `unlinkVivinoMatch` | `vivino_wines.delete().eq('wine_id', id)` | 직접 |
| `admin/dedupe-review/actions.ts` | `confirmDedupe` (merge) | `buildUpdatePatch(target, finalData)` | — (vivino는 별도 검수) |
| `api/vivino/rating/route.ts` | `cacheRating` | `vivino_wines.upsert({ wine_id, vivino_url, rating, reviews, ... })` | 직접 |
| `api/naver/shopping/route.ts` | (가격 갱신) | `wines_v2.update({ price })` | — |
| `api/admin/records/route.ts` | `create_wine` | `transformInput({ source: 'admin', name_ko, name_en, wine_type, country, grape_varieties: [grape_variety] })` | — |

#### Active scripts 매핑

| 스크립트 | v5 동작 |
|---|---|
| `scripts/promote-v2.ts` | `transformInput(rawToInput(raw))` 호출. dedupe·source_refs 처리 그대로 |
| `scripts/build-wines-v2.ts` (신규) | Phase 1 backfill — wines 전수 → `transformInput` → batch upsert |
| `scripts/update-wine-from-vivino.ts` | `vivino_wines.upsert(...)` + `buildUpdatePatch(current, { vivino })` |
| `scripts/restore-vivino-from-raw.ts` | `raw_payload.vivino_*` → `vivino_wines.upsert` |
| `scripts/enrich-wines.ts` | description만 (그대로) |
| `scripts/scrape-vivino-raw.ts` | raw_wines 대상이라 영향 없음 |

분석/일회성 스크립트(analyze-/check-/debug-/audit-)는 변경 안 함 — 히스토리.

### 4.8 어드민 UI 폼 필드 변경

#### 공통 매핑
| 기존 폼 필드 | v5 폼 필드 | 처리 |
|---|---|---|
| `country` + `country_ko` (2칸) | `country_ko` (1칸, **NOT NULL**) | 입력은 한·영 모두 허용, 모듈이 자동 변환 |
| `region` + `region_ko` + `region_path` (3칸) | `region_ko` (1칸) | 동일 (path 입력도 자동 분해) |
| `producer_ko` + `producer_en` (2칸) | `producer` (1칸, 영문 단일) | 한글 입력은 LLM 영문화 |
| `wine_style` + `wine_style_ko` (2칸) | `wine_style` (1칸, 영문) | 표시는 매핑 |
| `grape_varieties` + `grape_varieties_ko` (2칸) | `grape_varieties` (1칸, 한글) | 입력 영문도 자동 한글 변환. 비율은 `grape_blend`로 자동 분리 |
| `winery_en_clean` | `producer`로 통합 | — |
| `alcohol` (text) | `alcohol` (numeric) | 입력은 text 받고 모듈이 파싱 |

#### 영향 페이지 (5개)
- `/admin/wines` 편집 모달 (`WinesClient.tsx`)
- `/admin/vivino-review` 좌측 편집 (`ReviewClient.tsx`)
- `/admin/dedupe-review` final 편집 (`ReviewClient.tsx`)
- `/admin/raw-wines` "+ wines에 직접 추가" 모달 (`RawWinesClient.tsx`)
- `/admin/pending-wines` 승인 폼 (있다면)

각 페이지 폼은 위 공통 매핑 그대로. 입력 너그럽게(한·영 둘 다), 저장은 wines_v2 컬럼.

### 4.9 TS 인터페이스 변경

| 기존 | v5 | 위치 |
|---|---|---|
| `WineCreateInput` (vivino_* 14필드 평탄) | `WinesV2Input` (vivino 객체로 묶임) | `lib/promote-raw-wine.ts` → `lib/wines-v2-transform.ts`로 이동 |
| `WineFieldUpdate` | `Partial<WinesV2Input>` | `admin/vivino-review/actions.ts` |
| `FinalMergeData` | `Partial<WinesV2Input>` | `admin/dedupe-review/actions.ts` |
| `RawWineInput` | 그대로 | `lib/promote-raw-wine.ts` (raw_wines 변경 없음) |
| `Wine` (서빙 타입) | wines_v2 컬럼 + 옵션 `vivino: VivinoWine` | `src/types/index.ts` |
| `VivinoWine` (신규) | vivino_wines 컬럼 | `src/types/index.ts` |

```typescript
// src/types/index.ts (v5)
export interface Wine {
  id: string;
  source: 'wine21' | 'winenara' | 'gangnam' | 'naver_shopping' | 'user_submission' | 'admin';
  name_ko: string;
  name_en: string;
  wine_type: string;
  wine_style: string | null;
  country_ko: string;          // NOT NULL
  region_ko: string | null;
  producer: string | null;     // 영문 단일
  grape_varieties: string[];
  grape_blend: { grape: string; percent: number }[] | null;
  alcohol: number | null;
  brand: string | null;
  price: number | null;
  description: string | null;
  image_url: string | null;
  is_published: boolean;
  // 검색·어드민·검수 필드(search_tsv, locked_fields, needs_review 등)는 SELECT 시 제외 일반적
  vivino?: VivinoWine;
}

export interface VivinoWine {
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
}
```

---

## 5. 실행 계획 (Phase 0 ~ 7)

### Phase 0 — DDL 작성 (1 세션)

**산출물**:
- `supabase/migrations/20260429_create_wines_v2.sql`
- `supabase/migrations/20260429_create_vivino_wines.sql`
- `supabase/migrations/20260429_search_tsv_trigger_v2.sql`

**작업**:
- [ ] 위 §3.1, §3.2 DDL 그대로 적용
- [ ] 인덱스, 트리거, RLS 정책 (service_role만, swap 후 anon read 추가)
- [ ] dry-run 환경에서 빈 테이블 생성 확인

**검증**:
- [ ] 테이블 컬럼·타입·인덱스 확인
- [ ] 트리거 동작 확인 (수동 INSERT 후 search_tsv 자동 채워짐)

### Phase 1 — 변환 모듈 + backfill (2~3 세션)

> §4.6의 변환 모듈 시그니처를 따라 구현. 이 모듈이 backfill·INSERT·UPDATE 모든 진입점의 단일 소스가 됨.

**산출물 (순서대로)**:
1. `src/lib/wines-v2-transform.ts` — §4.6의 시그니처 그대로 구현
2. `src/lib/wines-v2-transform.test.ts` — 변환 단위 함수 테스트 (각 50건+)
3. `scripts/build-wines-v2.ts` — backfill (transformInput 호출만)

#### 1.0 변환 모듈 작성 — 먼저 끝내기

- [ ] `src/lib/wines-v2-transform.ts`의 단위 함수부터: `normalizeWineTypeEnum`, `parseAlcoholNumeric`, `buildSourceSnapshot`
- [ ] `translateGrapesToKo`: term_dict 1차 룩업 (현 `lib/grape-normalize.ts:normalizeGrapes` 흡수)
- [ ] `translateRegionToKo`: term_dict 룩업 (lib/admin/wines/actions.ts:lookup 흡수)
- [ ] `translateProducer`: 양방향 (한↔영). 한 LLM 호출로 두 결과 같이 받기
- [ ] `transformInput`, `buildUpdatePatch` — vivino 분리 + locked_fields 보호
- [ ] LLM 클라이언트는 옵션 파라미터로 받기 (테스트 시 mock)

#### 1.1 단위 테스트
- [ ] term_dict가 커버하는 케이스 (각 함수 20건)
- [ ] term_dict 미커버 → LLM 호출 (mock으로 검증)
- [ ] LLM 실패 → needs_review_reasons에 추가
- [ ] vivino 분리 (vivino 객체 있을 때 vivinoRow 반환, 없으면 null)
- [ ] locked_fields 보호 (해당 필드는 patch가 와도 무시)

#### 1.2 backfill 스크립트

**구조**:
```typescript
async function main(opts: { dryRun: boolean; limit?: number }) {
  const wines = await fetchAllWines();   // 20,603건
  const wineRows: WinesV2Row[] = [];
  const vivinoRows: VivinoWineRow[] = [];

  for (const w of wines) {
    const v2 = transformWine(w);
    if (hasVivinoData(w)) {
      vivinoRows.push(transformVivino(w));
    }
    wineRows.push(v2);
  }

  if (opts.dryRun) {
    printSummary(wineRows, vivinoRows);
    return;
  }

  await batchUpsert("wines_v2", wineRows);
  await batchUpsert("vivino_wines", vivinoRows);
  await recomputeSearchJamo();
  await recomputeEmbeddings();
}
```

**핵심 모듈**:
- `transformWine(w)` — 우선순위 fallback + 언어 변환
- `translateGrapesToKo(varieties)` — term_dict 1차, LLM 2차, 실패 시 needs_review
- `translateRegionToKo(region)` — 동일 패턴
- `translateProducerToKo(producer)` / `translateProducerToEn(producer)`
- `parseAlcoholNumeric(text)` — "13.5%" → 13.5
- `buildSourceSnapshot(w)` — naver/gangnam/wine21 흡수
- `validateWineTypeEnum(t)` — enum 외 값은 "other"

**검증 (dry-run 시 출력)**:
- 변환 성공/실패율 (term_dict 커버, LLM 호출 수, needs_review 수)
- NULL 분포 비교 (wines vs wines_v2)
- 우선순위 적용 통계 (final_* 사용된 건수)

**작업**:
- [ ] 변환 함수 단위 테스트 (각각 샘플 50건)
- [ ] dry-run 전체 실행 → 통계 검토
- [ ] needs_review 큐 적재 (별도 검수 테이블 또는 wines_v2 자체 플래그)
- [ ] apply 실행

### Phase 2 — 변환 검수 (1 세션)

**작업**:
- [ ] 어드민 페이지 `/admin/wines-v2-review` 신설 (간단 — list + diff + approve)
- [ ] needs_review 케이스 처리 (LLM 결과 수동 확인 + 수정)
- [ ] term_dict 보강 (자주 등장하는 미커버 용어)

### Phase 3 — 검색 인프라 (1 세션)

**작업**:
- [ ] `search_jamo` 재계산 스크립트
- [ ] `embedding` 재계산 (OpenAI API, 배치)
- [ ] 검색 품질 비교 (wines vs wines_v2)

### Phase 4 — 코드 전환 (2~3 세션, 가장 큰 작업)

**산출물**: 단일 PR (또는 작은 PR 묶음)

**전략**:
- 모든 write 경로는 §4.7 매핑표대로 **변환 모듈(`wines-v2-transform.ts`) 호출 형태로 일괄 리팩터**. 단순 grep & replace가 아님.
- 어드민 폼 필드는 §4.8 매핑대로 줄임 (한·영 입력 모두 허용, 모듈이 흡수).
- TS 인터페이스는 §4.9대로 변경 (`WineCreateInput` → `WinesV2Input` 등).
- 전환 동안 wines / wines_v2 양쪽 존재. 테이블명은 swap 직후를 가정해 `wines`로 그대로 작성.
- 또는 환경변수 `USE_WINES_V2=true`일 때 `wines_v2` 읽기. swap 시 토글 제거.

#### 진행 순서
1. 타입 (`src/types/index.ts`) 먼저 — `Wine`, `VivinoWine` 신설 → 컴파일 에러로 영향 범위 자동 파악
2. 핵심 라이브러리 (`wine-display.ts`, `wine-search.ts`, `promote-raw-wine.ts`) 변환
3. write 경로 7개 (§4.7 표대로 변환 모듈 호출)
4. read 경로 (페이지·API) — Wine + 옵션 vivino JOIN
5. 어드민 UI 폼 (§4.8)
6. 활성 scripts (§4.7 하단)
7. 빌드 + 타입체크 + 로컬 dev 점검

영향 받는 영역 (`memory/project_db_schema_current.md` + grep):

#### A. 핵심 라이브러리 (5)
- [ ] `src/lib/wine-display.ts` — fallback 체인 → 단일 컬럼
- [ ] `src/lib/wine-search.ts` — 검색 결과 빌드
- [ ] `src/lib/promote-raw-wine.ts` — promote/insert/autoMerge
- [ ] `src/types/index.ts` — Wine 타입 + VivinoWine 신설
- [ ] `src/lib/term-dict.ts` (있다면) — 매핑 사용처

#### B. 유저 서빙 페이지 (10+)
- [ ] `src/app/(app)/wines/[id]/page.tsx`
- [ ] `src/app/(app)/wines/[id]/VivinoRating.tsx` — vivino_wines props
- [ ] `src/app/(app)/wines/[id]/WineActions.tsx`
- [ ] `src/app/(app)/dictionary/page.tsx`
- [ ] `src/app/(app)/dictionary/DictionaryClient.tsx`
- [ ] `src/app/(app)/find/page.tsx`
- [ ] `src/app/(app)/diary/[id]/page.tsx`
- [ ] `src/app/(app)/diary/[id]/DiaryDetail.tsx`
- [ ] `src/app/(app)/diary/new/page.tsx`
- [ ] `src/app/(app)/wishlist/page.tsx`
- [ ] `src/app/(app)/recommend/page.tsx`
- [ ] `src/app/invite/[code]/page.tsx`

#### C. API (9)
- [ ] `src/app/api/wines/search/route.ts`
- [ ] `src/app/api/wine/[id]/route.ts`
- [ ] `src/app/api/wishlist/route.ts`
- [ ] `src/app/api/record/[id]/prefill/route.ts`
- [ ] `src/app/api/vivino/rating/route.ts` — vivino_wines 조회
- [ ] `src/app/api/ai/identify/route.ts`
- [ ] `src/app/api/ai/identify-by-name/route.ts`
- [ ] `src/app/api/ai/suggest/route.ts`
- [ ] `src/app/api/ai/recommend/route.ts`

#### D. 어드민 (8+)
- [ ] `src/app/admin/wines/WinesClient.tsx`, `actions.ts`, `page.tsx`
- [ ] `src/app/admin/vivino-review/*` — vivino_wines 기반으로
- [ ] `src/app/admin/dedupe-review/actions.ts` — merge 시 vivino_wines 처리
- [ ] `src/app/admin/raw-wines/*` — promote 결과 wines_v2로
- [ ] `src/app/admin/pending-wines/*` — 승인 시 wines_v2 INSERT
- [ ] `src/app/admin/reports/*` — 신고 컨텍스트
- [ ] `src/app/admin/page.tsx` — 대시보드 통계

#### E. 활성 스크립트 (10)
- [ ] `scripts/promote-v2.ts` — wines_v2로 INSERT
- [ ] `scripts/audit-existing-wines.ts` — wines_v2 대상으로
- [ ] `scripts/scrape-vivino-raw.ts` — raw_wines 대상이라 영향 없음 (확인)
- [ ] `scripts/update-wine-from-vivino.ts` — vivino_wines로
- [ ] `scripts/rematch-vivino-v4.ts`
- [ ] `scripts/restore-vivino-from-raw.ts`
- [ ] `scripts/enrich-wines.ts`
- [ ] 기타 활성 스크립트 (analyze-/check-/debug- 제외)

#### F. 트리거·RLS·뷰 (확인)
- [ ] `wines_display` view 재생성 (vivino_wines JOIN)
- [ ] `top_wines_by_events` RPC — wines_v2 참조로
- [ ] RLS 정책 wines_v2에 복제

### Phase 5 — Swap (5분 freeze)

**시점**: 코드 PR 머지 + 배포 직후. 사용자 통보.

**SQL** (단일 트랜잭션):
```sql
BEGIN;
ALTER TABLE wines RENAME TO wines_old;
ALTER TABLE wines_v2 RENAME TO wines;
-- search_tsv 트리거 이름도 변경
ALTER TRIGGER ... RENAME TO ...;
-- view 재생성 (wines 참조)
CREATE OR REPLACE VIEW wines_display AS ...;
COMMIT;
```

**검증** (swap 직후):
- [ ] count(wines) == 이전 wines + 신규
- [ ] FK 무결성: wine_records, pending_wines, wishlist, wine_events 정상 JOIN
- [ ] 핵심 화면 5개 즉시 확인 (find, dictionary, wines/[id], diary, admin/wines)

**롤백** (문제 시):
```sql
BEGIN;
ALTER TABLE wines RENAME TO wines_v2;
ALTER TABLE wines_old RENAME TO wines;
COMMIT;
-- 코드는 환경변수 토글로 즉시 wines_old 컬럼 구조로 복귀
```

### Phase 6 — 모니터링 (수일)

**작업**:
- [ ] 에러 로그 모니터링 (빈 컬럼 참조, 매칭 누락)
- [ ] 어드민 5명(=2명) 손으로 5~10개 와인 점검
- [ ] needs_review 큐 잔여 처리

### Phase 7 — 정리 (1 세션)

**작업**:
- [ ] `wines_old` DROP migration
- [ ] `wines_backup_pre_v5`(만약 만들었다면) DROP
- [ ] `term_dict` 보강분 커밋
- [ ] 이 문서 "완료" 표시
- [ ] 메모리 갱신 (`project_wines_v5_simplification_pending.md` → `_complete.md`)

---

## 6. 위험 관리

### 6.1 반드시 지킬 것 (non-negotiable)
- `wine_records.wine_id` / `pending_wines.promoted_wine_id` FK 무결성
- `wines_v2.id = wines.id` 정책 엄수 (id 새로 발급 금지)
- `raw_wines` append-only 유지 (변경 없음)
- 배포 전 타입체크 + 빌드 정상

### 6.2 swap 시점 가드
- swap 직전 5분 동안 어드민 write 차단 (간단 메시지 띄움)
- 실 유저 2명이라 user-facing freeze 영향 미미
- swap은 단일 트랜잭션으로 atomic

### 6.3 검수 큐 누락 방지
- needs_review=true는 swap 후에도 해소 가능 (비차단)
- 단 영향 큰 컬럼(grape_varieties, region_ko)은 swap 전 90% 이상 정리 권장

### 6.4 백업
- swap 시 자동으로 wines_old 보존 (별도 백업 테이블 불필요)
- swap 후 ≥ 수일 보존

---

## 7. 의사결정 사항 (확정)

| 항목 | 결정 |
|---|---|
| ① id 정책 | **A. 동일 id 유지** (FK 영향 0) |
| ② 동기화 방식 | **A. 일회성 snapshot + freeze swap** |
| ③ 변환 검수 흐름 | **B. LLM 자동 번역 + needs_review 플래그** |
| ④ vivino_wines 분리 시점 | **A. wines_v2와 동시에** |

추가:
- `final_*` 8개: 정규 컬럼에 흡수 후 일괄 폐기. 어드민 override는 `locked_fields`로
- `wines_backup_pre_v5`: **불필요** (wines_old가 그 역할)

---

## 8. 다음 세션 시작 절차

### 8.1 컨텍스트 확인
1. 이 문서 전체 읽기
2. 메모리 파일:
   - `memory/project_db_schema_current.md` (실제 DB 상태)
   - `memory/project_v5_normalization_decisions.md` (정규화 정책)
   - `memory/feedback_grape_ko_french_style.md` (품종 한글 표기)
   - `memory/feedback_winery_canonical_source.md` (와이너리 우선순위)
3. 현재 DB 상태 재확인:
   ```bash
   export PATH="/c/Program Files/nodejs:$PATH"
   NODE_ENV=development npx tsx scripts/check-v5-status.ts
   NODE_ENV=development npx tsx scripts/audit-language-consistency.ts
   ```

### 8.2 작업 시작 순서
- **이번 세션이 Phase 0** (DDL 작성)부터 시작
- Phase 0 ~ 1은 한 세션에 묶을 수 있음 (DDL + backfill 스크립트 골격)
- Phase 2 (검수)는 별도 세션
- Phase 4 (코드 전환)은 분량 커서 2~3 세션 분할 가능
- Phase 5 (swap)는 짧지만 사용자 통보·실시간 확인 필요

---

## 9. 진행 기록

세션마다 이 섹션 갱신. 형식:

```
### 2026-MM-DD (세션 N)
- 완료: Phase 0
- 미결: Phase 1 dry-run 통계 검토
- 이슈: term_dict 영문 품종 커버리지 60%, LLM 호출 필요분 ~7,000건
```

### 2026-04-28 (세션 0 — 계획 수립 + 보강)
- 완료: 정규화 정책 확정 (wine_style 영문, grape 한글, producer 이중)
- 완료: wines_v2 신설 전략 확정
- 완료: 이 문서 재작성
- 완료: Phase 0 마이그레이션 파일 작성 (적용 보류)
  - `supabase/migrations/20260429_create_wines_v2.sql`
  - `supabase/migrations/20260429_create_vivino_wines.sql`
  - `scripts/apply-v5-phase0.ts` (적용 + 검증, 미실행)
- 완료: write 경로 7개 + active scripts 전수 조사
- 완료: §4.6~4.9 보강 (변환 모듈 명세, write 경로 매핑, UI 폼 변경, TS 인터페이스 변경)
- 참고:
  - 현 wines: 20,603건 / 62컬럼
  - vivino_url 있음: 11,677건
  - `wines_v2`, `vivino_wines`, `wines_backup_pre_v5` 모두 미생성
  - 보강 동기: 단순 grep&replace로는 INSERT/UPDATE 변환 일관성 깨짐 → 단일 변환 모듈 필요

### 2026-04-29 ~ 2026-05-01 (세션 1 — Phase 0/1 단단히)

Phase 0 (DDL) + Phase 1 (변환 모듈) 설계를 단단히 한 세션. 마이그레이션 적용은 아직.

- 완료: **Phase 0 결정 5가지**
  - source → ENUM (오타 차단)
  - name_ko UNIQUE 유지
  - price >= 0 CHECK
  - search_query_en 유지 (Vivino 검색용)
  - needs_review_reasons text[] 신설
- 완료: **vivino_wines 결정**
  - id 컬럼 삭제, wine_id가 PK (1:1 명확화)
  - rating CHECK 0~5, reviews CHECK >= 0, match_score CHECK 0~1
- 완료: **정규화 정책 정정** (메모리 갱신)
  - producer 이중 컬럼 → **영문 단일** (표시 일관성 + 데이터 92.5% 즉시 사용 가능)
  - 한글 표기 정책: 출신 국가 원어 발음 우선 (부르고뉴/토스카나/토커이), 한국 관용이 명확히 다르면 관용 우선 (샴페인/코냑)
- 완료: **변환 함수 케이스 정의 (Phase 1.0)**
  - grape: 비율 추출 (`grape_blend` jsonb 컬럼 신설), 괄호 제거, 한글 미커버 통과
  - country/region: NOT NULL/NULL 분리, finest first(뒤), fallback up, 괄호 제거
  - producer: 영문 단일, 한글 입력은 LLM 단계 대상
  - wine_type/alcohol/wine_style: 단순 (변경 적음)
  - vivino: url 검증 (vivino.com), match_score >= 0.9면 autoReviewed
- 완료: **wines_v2 컬럼 27 → 29** (grape_blend, needs_review_reasons 추가)
- 완료: **변환 모듈 골격 구현** (`src/lib/wines-v2-transform.ts`)
  - `WinesV2Input`, `VivinoInput`, `WinesV2Row`, `VivinoWineRow`, `GrapeBlendItem`, `TermDictLookup`
  - `TransformResult` discriminated union (ok:true/false)
  - 단위 함수: `normalizeWineTypeEnum`, `parseAlcoholNumeric`, `buildSourceSnapshot`, `extractGrapePercent`, `stripParenthetical`, `isValidVivinoUrl`
  - 번역 함수: `translateGrapesToKo`, `translateRegionToKo`, `translateProducer`
  - 메인 진입: `transformInput`, `buildUpdatePatch` (locked_fields 보호 + fillEmptyOnly)
  - LLM 미통합 (term_dict 매칭만, 미커버는 needs_review로 표기)
- 완료: 본 docs §3.1, §3.2, §4.2, §4.6, §4.8, §4.9 갱신
- 미결:
  - LLM 통합 (영문 미커버 자동 한글화)
  - 단위 테스트
  - backfill 스크립트 (`scripts/build-wines-v2.ts`)
  - Phase 0 마이그레이션 적용

---

## 10. 관련 파일

### 마스터
- 이 문서 (`docs/wines-schema-simplification.md`)

### 보조 문서
- `docs/wines-redesign-plan-v3.md` — 이전 v3 재설계 (히스토리)
- `docs/wines-redesign-plan.md` — 더 이전
- `docs/wine-db-enrichment-plan.md`
- ~~`docs/phase-29-vivino-separation-checklist.md`~~ — **이 문서에 통합됨, 더 이상 사용 안 함**

### 메모리
- `memory/project_v5_normalization_decisions.md` — 언어 표준 결정
- `memory/project_db_schema_current.md` — 실제 DB 스키마
- `memory/feedback_raw_wines_wines_independent.md` — 독립 레이어 원칙
- `memory/feedback_grape_ko_french_style.md` — 품종 한글 표기 룰
- `memory/feedback_winery_canonical_source.md` — 와이너리 우선순위
- `memory/feedback_matching_precision.md` — precision 우선

### 스크립트
- 기존: `scripts/promote-v2.ts`, `scripts/audit-existing-wines.ts`
- 신규: `scripts/build-wines-v2.ts` (Phase 1)
- 감사: `scripts/check-v5-status.ts`, `scripts/audit-language-consistency.ts`

---

## 11. 작업 시작 세션에게

1. 이 문서를 단순한 계획이 아니라 **계약**처럼 여길 것.
2. id 정책 A(동일 id), swap 방식 A(일회성)는 변경 시 위험 큼 — 함부로 바꾸지 말 것.
3. 실 유저 2명이라 빠른 진행 가능. 단 FK 무결성·precision 우선 원칙은 그대로.
4. needs_review 케이스는 swap 후에도 해소 가능 — 검수에 매몰되지 말 것.
5. 이 문서를 진행하면서 갱신 (§9 진행 기록).
