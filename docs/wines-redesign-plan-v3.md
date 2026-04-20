# DB 재설계 플랜 v3

> 작성일: 2026-04-20 (baseline 측정 및 방침 확정 완료)
> 목적: **검색 품질 향상 + 한글화 + 와인 사전 기능**을 하나의 재설계로 함께 풀어낸다.
> 상태: **Phase 0~2 실행 완료 · Phase 3 진입 (dry-run 단계)** — 프로덕션 직접 실행 중
> 관계: v2 (`wines-redesign-plan.md`)의 철학·원칙을 계승하되, `wines` 스키마와 검색 인프라를 본 문서에서 재설계.

---

## 실행 로그 (2026-04-20)

### Phase 0: 백업 + 확장 확인 ✅
- JSON 전체 덤프 완료 (107MB, 7개 테이블): `backup/v3-phase0-2026-04-20-1258/`
- 확장 확인: `pg_trgm 1.6`, `vector 0.8.0`

### Phase 1: term_dict 구축 ✅
- 용어 추출: 4,108건 (country 60 / region 2,603 / grape 1,009 / style 436)
- style 화이트리스트 필터링 후 3,678건 → LLM 번역 (Haiku 4.5, $1.29)
- 중복 병합 + aliases 통합 후 최종 INSERT **2,324건** (country 37 / region 1,816 / grape 465 / style 6)
- 스킵 205건은 `backup/v3-phase1-skipped-*.json` 별도 보관

### Phase 2: 스키마 재구성 ✅ (일부 Phase 3 이후로 이관)

| TX | 작업 | 결과 |
|---|---|---|
| TX-1 | `raw_wines`에 관리 컬럼 ADD + 역이관 + 연결 백필 + XOR 정리 | legacy_backfilled=**3,493** / wine21_linked=**33,031** / orphan_wines=**15** / xor_remaining=**0** |
| TX-2 | 세션 테이블 3개 DROP | ✅ |
| TX-3 | RLS `service insert/update` 정책 제거 | **Phase 5로 이관** — 제거 시 `src/app/api/vivino/rating/route.ts`(anon key)가 깨짐. 해당 route 수정과 함께 처리 |
| TX-4 | `wines` 신규 컬럼 17개 ADD | ✅ (1회 실행으로 13/17, 누락 4개는 개별 ADD로 보완) |
| TX-5 | `region→region_path`, `naver_image→image_url`, `data_source→source` 값 복사 | region_path=2,516 / image_url=3,136 / source=36,410(전수) |
| TX-6 | `pending_wines` 신규 컬럼 8개 ADD | ✅ |
| TX-7 | `wine_records` override_* 컬럼 8개 ADD | ✅ |
| TX-8 | `evaluations` 테이블 CREATE + 인덱스 + RLS | ✅ |
| TX-9 | `wine_wishlist` `pending_wine_id`, `note` ADD | ✅ |

**Phase 2에서 미완 (Phase 3 백필 완료에 의존)**:
- 구 컬럼 DROP: `grape_variety`, `region`, `naver_image`, `data_source`, `final_*` 8개, `naver_link`(raw_payload로 이관 후), 기타
- 필수 필드 NOT NULL 제약: 기준 미달 DELETE 후 적용
- `search_tsv` generated 컬럼 + GIN 인덱스
- View: `wines_display`, `wine_records_enriched`
- RPC: `search_wines`, `dictionary_filter_options`

### 발견된 실제 스키마 차이 (v3 문서 기존 가정과 다름)
- `wines.is_published` **컬럼 없음** (현재 RLS 정책은 `USING (true)`로 적정 — 드롭 작업 불필요)
- `wines.base_*` 컬럼 **이미 없음** (이전에 제거됨 — 드롭 작업 불필요)
- `wines.final_*` 컬럼 **8개 존재** — Phase 3 백필 후 DROP
- `raw_wines` 의 Vivino 필드는 **컬럼이 아닌 `raw_payload` JSONB 내부**에 저장 (migration 파일과 다름)
- `raw_wines`에 `promoted_wine_id`/`promoted_at`/`rejected_reason` 컬럼 **원래 없었음** — TX-1에서 ADD
- 현재 `wines` 정책 `service insert`/`service update`의 `roles`가 **`{public}`** (이름이 오해 소지)

### Phase 3: 기존 wines 보강 + gangnam promote ✅

1. **`backfill-wines-v3.ts`** — wines 36,410행 대상:
   - 신규 필드 채움 (grape_varieties, wine_type, country, country_ko, region_ko, winery_en_clean, brand, search_query_en, wine_style 등)
   - term_dict 룩업으로 한글화
   - vivino_page_url/vivino_url 상세 URL 신뢰 조건 (패턴 `/w/\d+`)으로 grape_varieties 채움
   - 결과: **36,123건 UPDATE** (에러 1건, Cloudflare 502 일시오류)
   - 필드별 채움: country_ko 98.5%, region_ko 94.1%, wine_type 90.4%, grape_varieties 46.4%

2. **`promote-gangnam.ts`** — gangnam 1,836건 중 기준 충족:
   - 1,024건 신규 INSERT
   - 156건 name_ko 중복(wine21 기존) → `promoted_wine_id`만 연결

3. **기준 미달 정리** (override 보호 + DELETE):
   - `pending_wines.promoted_wine_id` nullify (FK NO ACTION 방지)
   - wine_records 2건에 `override_wine_type/country/region/...` 복사
   - **19,671건 DELETE** (미달 wines 제거)
   - wine_records 중 2건이 wine_id = NULL 상태 (이후 Phase 4에서 pending으로 이동)

4. **Phase 3 최종 결과**:
   - `wines`: **17,763건 전수 5개 필수 필드 충족** (100%)
   - 소스별: wine21 13,935 / naver_shopping 2,414 / gangnam 1,024 / winenara 387 / user_submission 3
   - raw_wines 대기: 약 22,000건 (향후 보강 시 승격)

### Phase 4: 평가/위치 이관 + 끊긴 참조 처리 ✅

1. **TX-4a**: 끊긴 wine_records 2건 → pending_wines INSERT + 재연결
2. **TX-4b**: `record_evaluations` 1건 → `evaluations(role='guest')` 이관
3. **TX-4c**: wine_records 평가 필드 → `evaluations(role='owner')` 이관 (44건)
4. **TX-4d**: `location` → `place_name` 이관 (44건)
5. 알베로 인 피오레 중복 pending 1건 정리 (evaluations FK 경유, 재연결)

### Phase 2 잔여 완료 ✅ (view/RPC/search_tsv/제약)

1. **wines_display view** + **wine_records_enriched view** 생성 — COALESCE 체인으로 한글 우선 표시
2. **search_tsv** generated column (STORED) — `simple_tsv`/`simple_tsv_array` IMMUTABLE wrapper로 generation expression 해결
3. **인덱스**: `wines_search_tsv_idx` (GIN), `name_ko_trgm`, `name_en_trgm`, `grape_varieties[_ko]` GIN, `(wine_type, country_ko)`, `source`
4. **RPC**:
   - `search_wines(q, filter_*, q_embedding, k)` — q를 term_dict aliases로 **OR 확장** 후 tsvector 매칭 + trigram 보완 + Vivino 인기도 부스트. 까베르네/카베르네/샤도네/메를롯 모든 표기 변형 정상 매칭 확인.
   - `dictionary_filter_options(filter_wine_type)` — 타입 의존 품종 필터 데이터 반환
5. **제약**: `name_en`/`wine_type`/`country` `NOT NULL`, `grape_varieties` CHECK(`array_length >= 1`), wine_records XOR CHECK

### 현재 상태 (Phase 5 진입 시점, 2026-04-20)

| 영역 | 수치 |
|---|---|
| `wines` | **17,763건** (전수 5개 필수 필드 충족) |
| `raw_wines` | 40,315건 (미연결 약 3,791건 보강 대기) |
| `wine_records` | 48건 살아있음 (XOR 적용, orphan 0) |
| `pending_wines` | 26건 |
| `evaluations` | 45건 (owner 44 + guest 1) |
| `term_dict` | 2,324건 (4쌍 동의어 통합: Syrah/Shiraz, Grenache/Garnacha, Mourvèdre/Monastrell/Mataro, Tempranillo+aliases) |
| search_tsv + 인덱스 | 동작 확인 (한/영 aliases 검색 정상) |
| view / RPC | `wines_display`, `wine_records_enriched`, `search_wines`, `dictionary_filter_options` |

### 발견된 실제 스키마 차이 (v3 문서 기존 가정과 다름)
- `wines.is_published` **컬럼 없음** (현재 RLS 정책은 `USING (true)`로 적정 — 드롭 작업 불필요)
- `wines.base_*` 컬럼 **이미 없음** (이전에 제거됨 — 드롭 작업 불필요)
- `wines.final_*` 컬럼 **8개 존재** — Phase 5 안정화 후 DROP
- `raw_wines` 의 Vivino 필드는 **컬럼이 아닌 `raw_payload` JSONB 내부**에 저장 (migration 파일과 다름)
- `raw_wines`에 `promoted_wine_id`/`promoted_at`/`rejected_reason` 컬럼 **원래 없었음** — TX-1에서 ADD
- 현재 `wines` 정책 `service insert`/`service update`의 `roles`가 **`{public}`** (이름이 오해 소지)
- `to_tsvector`, `array_to_string`이 STABLE로 분류되어 generated column에서 직접 사용 불가 → `simple_tsv(text)`, `simple_tsv_array(text[])` IMMUTABLE wrapper 함수 정의해 우회

### Phase 5: 코드 적응 ✅ (2026-04-20 main merge + push)

**5a 커밋** (`9a6ca2c`):
- `types/index.ts` — WineRecordEnriched/WineDisplay/Evaluation 타입 추가, 세션 타입 제거
- `wine-display.ts` — 한글(`*_ko`) 필드 우선 COALESCE 체인
- `wines/[id]/page.tsx` — 헤더 "Wine Details" → "와인 상세", `image_url`/`source` fallback 추가
- `diary/[id]/page.tsx` + `DiaryDetail.tsx` — 헤더 "Wine" → "와인", `wineFields`에 v3 한글·정규화 필드 확장, TYPE_KO에 dessert 추가
- `api/wines/search` + `lib/wine-search.ts` — `search_wines` RPC 기반 래핑 (랭킹 RPC + id IN 보강 SELECT)
- 세션 관련 코드 3개 파일 제거 (`app/session/**`, `app/(app)/session/**`, `lib/actions/session.ts`)

**5b 커밋** (`f2b7a2f`):
- `record_evaluations` 테이블 참조 12곳을 `evaluations`(`role='guest'`)로 교체
  - `actions/diary.ts`의 `deleteRecordEvaluation`/`upsertRecordEvaluation`/`linkRecords` 내부 4곳
  - `api/invite/evaluate/route.ts` INSERT/UPDATE (wine_id/pending_wine_id denormalize 추가)
  - `diary/[id]/page.tsx`, `diary/[id]/evaluate/page.tsx`, `invite/[code]/page.tsx` 읽기
- `api/vivino/rating/route.ts` — 검색 URL(`/search/wines?q=`) 저장 로직 제거, 이후 `vivino_url` = `vivino_page_url`로 통일
- DB trigger 추가: `wine_records_sync_owner_eval` — `wine_records` 평가 필드 수정 시 `evaluations(role='owner')` 자동 upsert → 기존 owner 평가 저장 경로(`wine_records.rating` 컬럼)를 그대로 둔 채 view의 COALESCE가 항상 최신 데이터 보도록 브릿지

**검증**:
- `npx next build` 타입체크 통과
- main merge 후 origin push 완료 (커밋 `c3ab9d1`)
- Vercel 자동 배포

**의도적으로 남겨둔 것 (안정화 기간 브릿지)**:
- `wines.final_*` 8개 컬럼, `naver_image`, `data_source`, `grape_variety`, `region`, `producer`
- `wine_records.name/wine_type/wine_country/grape_variety/wine_name_original/wine_vivino_url/rating/value_score/pairing_score/memo/repurchase_intent/location`
- `record_evaluations` 테이블 (데이터는 1건만, 아직 DROP 안 함)
- Phase 5 핵심 코드는 모두 view/RPC/신규 필드로 이관됨. 위 구 컬럼은 1~2주 안정화 확인 후 `Phase 2 잔여-5`에서 일괄 DROP.

### 다음 (연기됨)
- **Phase 6 (와인 사전 `/dictionary`)**: 후순위
- **Phase 2 잔여-5 (구 컬럼 DROP + trigger 제거)**: 안정화 이후
- **Phase 7~8 (pgvector + 검증)**: 후행

---

**핵심 방침 요약 (baseline 2026-04-20 실측 반영)**:
- `wines` = **5개 필수 필드**(`name_ko`, `name_en`, `wine_type`, `country`, `grape_varieties[]`) 모두 충족한 와인만. 기준 미달은 `raw_wines`에 대기.
- in-place ALTER로 `wines` 재설계 (DROP 금지, wine_id 보존)
- legacy 3,493건 전수 역이관 → `raw_wines`에 영구 보존
- wine21 32,776건 FK 연결 백필 (name_ko 정확 매칭), 잔여 7,642건 유사도 매칭
- `is_published` 드롭, RLS `USING (true)`로 단순화
- Phase 3 백필 후 기준 미달 wines는 `override_*` 보호 후 DELETE
- `grape_varieties[]`는 **vivino_grapes 등 신뢰 소스에서만** 채움. `parsed_grape_varieties`(와인명 기반)는 fallback 금지 — precision 우선
- **Vivino URL 정제**: `wines.vivino_page_url` → canonical `wines.vivino_url`로 통합. 구 `vivino_url`만 있고 `vivino_page_url` 없는 legacy 871건은 `vivino_*` 전부 null(FP 잔재 위생). `raw_wines`의 `raw_payload.vivino_url`은 이미 상세 URL(v4 재매칭)이라 정제 불필요
- 최종 `wines` 예상 건수: **약 18,852건** (이전 예상 36,750에서 정확도 기준으로 감소). 나머지 ~21,463건은 `raw_wines`에 대기

---

## 한 줄 요약

> 영어로 흩어져 있는 와인 정보를 **한글로 정규화해 DB에 저장**하고, 그 정규화된 필드로 **검색·필터·표시**를 모두 지탱한다.

---

## 왜 v3가 필요한가

v2는 "와인 DB 우선" 철학으로 전체 구조를 정리하는 데 집중했다. 하지만 실제 제품에서 다음 세 문제가 남아 있었다:

1. **검색 매칭율이 낮다** — 현재 `wine-search.ts`는 `ilike` + `.includes()` 기반. 정규화된 인덱스 없음.
2. **UI에 영어가 그대로 노출된다** — Vivino에서 온 `region`, `grape_variety`, `wine_style` 등이 "Bordeaux", "Cabernet Sauvignon" 영어로 표시.
3. **와인 사전 기능이 기반 부족** — 타입·품종·국가 필터를 제공하려면 정규화·인덱싱된 필드가 필요.

세 문제는 **같은 해법으로 묶인다**: wines 테이블에 정규화된 한글 필드를 두고, 그 필드로 검색·필터·표시를 모두 처리한다.

---

## 네 가지 축이 어떻게 맞물리나

```
[한글화]
  └─ wines에 *_ko 컬럼 저장 (term_dict로 번역)
         │
         ├─> [UI 표시] 와인 상세/기록 상세에서 한글 우선 노출
         │
         ├─> [검색 품질] tsvector 인덱스에 한글 필드 포함
         │
         └─> [와인 사전] 필터 선택지로 사용 (타입/품종/국가)
                          │
                          └─> 검색 인프라 재사용

[DB 재설계 (v2 계승)]
  └─ 정체성 필드 중복 제거, evaluations 분리, staging/canonical 분리
```

하나의 정규화 작업이 네 기능을 모두 지탱한다.

---

## 저작권/저장 원칙 (v2 계승)

| 카테고리 | 저장 가능 | 비고 |
|---|---|---|
| 사실 데이터 (type, country, grape, alcohol, rating 등) | ✅ | |
| 단순 포인터(URL) | ✅ | vivino_url, naver_link |
| 창작물 텍스트 (description, tasting note) | ❌ | Naver/Vivino 모두 저장 금지 |
| 워터마크 이미지 | ❌ | Naver thumbnail 등 |
| 타사 호스팅 이미지 | ⚠️ | 링크만, 자체 호스팅 회피 |

한글 번역값은 **사실 데이터의 표기 변환**이므로 저장 가능 (고유명사 번역 포함).

---

## 확정된 결정 사항 (15개)

| # | 결정 | 비고 |
|---|---|---|
| 1 | v3는 v2의 구조(staging/canonical, evaluations 분리, pending_wines, wine_records_enriched view, 세션 드롭)를 **그대로 계승** | v2의 13개 결정은 여전히 유효 |
| 2 | `wines`에 **정규화 영문 필드** 추가: `winery_en_clean`, `brand`, `search_query_en`, `grape_varieties text[]`, `wine_style`, `region_path` | 검색 인덱싱 대상 |
| 3 | `wines`에 **한글 표시 필드** 추가: `country_ko`, `region_ko`, `grape_varieties_ko text[]`, `wine_style_ko` | UI 표시 + 검색 보강 |
| 4 | **`term_dict` 테이블 신규** — 영↔한 매핑 SSOT (category, en, ko, aliases) | LLM 일괄 생성 후 수작업 검증 |
| 5 | **tsvector generated column** `search_tsv` + 필드 가중치(A/B/C) | 검색 RPC에서 사용 |
| 6 | **pg_trgm 인덱스 병행** (`name_ko`, `name_en`) — 한글 토큰화 보완 | 'simple' 설정 한계 극복 |
| 7 | **`embedding vector(1024)` 컬럼 추가** — 인덱스는 Phase 2 | Voyage `voyage-3-lite` 기준 |
| 8 | **Vivino 인기도 부스트** — `log(1 + vivino_reviews) × vivino_rating`을 랭킹에 가산 | precision은 절대 우선 |
| 9 | **검색은 wines만 대상** — pending_wines는 검색 결과에서 제외 | 품질 불안정, precision 우선 원칙 |
| 10 | **UI 한글화 스코프**: 와인 상세(`/wines/[id]`) + 와인 기록 상세(`/diary/[id]`)의 "와인 디테일" 영역 | 섹션 헤더도 한글로 ("Wine Details"→"와인 상세") |
| 11 | **winery 한글화는 보류** — 고유명사 특성상 영문 유지. 한글 음차는 별도 확보 시 추가 | 도멘 르로이 등 관례 있으나 불안정 |
| 12 | **와인 사전 기능** — 새 페이지(`/dictionary` 가칭)에서 검색어 + 필터 4종(타입·품종[타입 의존]·가격·국가) | 기존 `/find`와의 통합은 후행 |
| 13 | **wines 필수 필드 5개** (`name_ko`, `name_en`, `wine_type`, `country`, `grape_varieties[]`) **NOT NULL / NOT EMPTY** | 서비스 노출·검색 대상은 이 5개 전부 충족한 와인만 |
| 14 | **`is_published` 컬럼 드롭 + RLS `USING (true)`로 단순화** | 현재 앱이 참조 안 함. 노출 게이트는 "필수 필드 충족"이 대체 |
| 15 | **기준 미달 wines 최종 처리**: Phase 3 백필 후에도 미달인 행은 wines에서 **DELETE**. raw_wines에 원본 전수 보존(역이관 선행) → 향후 보강 시 재 promote. `wine_records` 참조건은 삭제 전 `override_*` 필드로 값 복사하여 UI 보호 | legacy 전수 역이관 전제 |

---

## 엔티티 구조

```
[Dictionary]   term_dict  (영↔한 매핑 사전)
                   │
                   │ 룩업
                   ↓
[Staging]      raw_wines  (수집 크롤러 전용)
                   │ promote
                   ↓
[Canonical]    wines  ←──────────┐
                   ↑              │ wine_id FK
                   │              │
[User-submit]  pending_wines      │
                   ↑              │ pending_wine_id FK
                   │              │
[Experience]   wine_records ──→ evaluations
                   │
                   ├─→ record_mentions
                   └─→ shared_experience_records

[View]         wine_records_enriched  (기록 조회용, COALESCE 한글→영문)
[View]         wines_display          (와인 상세 조회용, COALESCE 한글→영문)
[RPC]          search_wines(q, filters, q_embedding, k)
```

---

## 전체 스키마

### 1. `term_dict` (신규 — 영↔한 매핑 SSOT)

```sql
CREATE TABLE term_dict (
  category text NOT NULL CHECK (category IN ('country','region','grape','style')),
  en       text NOT NULL,
  ko       text NOT NULL,
  aliases  text[] DEFAULT '{}',   -- 검색 시 추가 매칭용 동의어 (예: 까베르네, 까베르네소비뇽)
  verified boolean DEFAULT false, -- 수작업 검증 완료 여부
  source   text,                  -- 'llm_initial' | 'manual' | 'llm_fallback'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (category, en)
);

CREATE INDEX term_dict_ko_idx ON term_dict (category, ko);

-- RLS: public read (앱에서 필터 UI 용도로 읽음), service_role write
ALTER TABLE term_dict ENABLE ROW LEVEL SECURITY;
CREATE POLICY "term_dict: public read" ON term_dict FOR SELECT USING (true);
```

**초기 구축**:
- `scripts/build-term-dict.ts` — Haiku 4.5로 일괄 생성 (품종 ~300개 + 지역 ~500개 + 국가 ~50개 + 스타일 ~20개, 예상 비용 < $1)
- 수작업 검증 후 `verified=true` 마킹
- promote 시 miss 건 → LLM fallback으로 사전 확장

---

### 2. `wines` (재설계 — 검색·표시·필터의 중심)

```sql
CREATE TABLE wines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ─── 정체성 (필수 · 사용자 표시용) ───
  name_ko       text NOT NULL,           -- wine21 음차 or 수작업
  name_en       text NOT NULL,           -- 원문 영문명 (필수)
  producer_ko   text,                    -- 생산자 한글
  producer_en   text,                    -- 생산자 영문

  -- ─── 검색 인덱싱 대상 (영문 정규화) ───
  winery_en_clean text,                  -- 법인/괄호 제거된 클린 와이너리명
  brand           text,                  -- LLM 파싱된 브랜드 (예: "Chateau Margaux")
  search_query_en text,                  -- LLM 생성 canonical 영문 검색 문자열

  -- ─── 분류 (영문 · 필수) ───
  wine_type     text NOT NULL CHECK (wine_type IN ('red','white','rose','sparkling','fortified','dessert','other')),
  country       text NOT NULL,
  region_path   text,                    -- "France / Bourgogne / Côte de Beaune"
  grape_varieties text[] NOT NULL DEFAULT '{}' CHECK (array_length(grape_varieties, 1) >= 1),  -- 빈 배열 불가
  wine_style    text,                    -- "Still Red", "Sparkling White" 등
  alcohol       numeric(4,1),

  -- ─── 분류 (한글 표시 · nullable, term_dict 룩업으로 채움) ───
  country_ko          text,              -- "프랑스"
  region_ko           text,              -- "보르도"
  grape_varieties_ko  text[] DEFAULT '{}',  -- ["카베르네 소비뇽", "메를로"]
  wine_style_ko       text,              -- "레드", "스파클링" 등

  -- ─── 메타 ───
  image_url     text,                    -- 워터마크 없는 이미지만

  -- ─── 외부 링크 ───
  vivino_url           text,
  vivino_wine_id       text,
  vivino_rating        numeric(2,1),
  vivino_ratings_count integer,
  naver_link           text,

  -- ─── 수정 보호 ───
  source_snapshot jsonb,                 -- 최초 import 시점 원본 (감사/복원용)
  locked_fields   text[] DEFAULT '{}',   -- 어드민 수정 보호 필드

  -- ─── 소스 추적 ───
  source       text NOT NULL CHECK (source IN ('wine21','naver_shopping','winenara','gangnam','user_submission','legacy','manual','promoted')),
  source_refs  jsonb DEFAULT '{}',       -- { wine21: "181028", vivino: "12345" }

  -- is_published 드롭됨. 노출 게이트는 NOT NULL 제약이 대체.

  -- ─── 검색 (generated) ───
  search_tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(winery_en_clean,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(brand,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(search_query_en,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(name_en,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(name_ko,'')), 'B') ||
    setweight(to_tsvector('simple', array_to_string(grape_varieties, ' ')), 'B') ||
    setweight(to_tsvector('simple', array_to_string(grape_varieties_ko, ' ')), 'B') ||
    setweight(to_tsvector('simple', coalesce(region_path,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(region_ko,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(country,'')), 'C') ||
    setweight(to_tsvector('simple', coalesce(country_ko,'')), 'C') ||
    setweight(to_tsvector('simple', coalesce(wine_style,'')), 'C') ||
    setweight(to_tsvector('simple', coalesce(wine_style_ko,'')), 'C')
  ) STORED,

  -- ─── 벡터 검색 (Phase 2) ───
  embedding vector(1024),                -- Voyage voyage-3-lite
  embedded_at timestamptz,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ─── 인덱스 ───
CREATE INDEX wines_search_tsv_idx     ON wines USING gin (search_tsv);
CREATE INDEX wines_name_ko_trgm_idx   ON wines USING gin (name_ko gin_trgm_ops);
CREATE INDEX wines_name_en_trgm_idx   ON wines USING gin (name_en gin_trgm_ops);
CREATE INDEX wines_grape_varieties_idx    ON wines USING gin (grape_varieties);
CREATE INDEX wines_grape_varieties_ko_idx ON wines USING gin (grape_varieties_ko);

-- 필터 인덱스 (와인 사전)
CREATE INDEX wines_type_country_idx   ON wines (wine_type, country_ko);
CREATE INDEX wines_source_idx         ON wines (source);

-- 인기도 부스트용 (Vivino)
CREATE INDEX wines_popularity_idx
  ON wines ((coalesce(vivino_rating,0) * ln(1 + coalesce(vivino_ratings_count,0))) DESC);

-- RLS: wines는 전부 공개 (NOT NULL 제약이 노출 게이트 역할)
ALTER TABLE wines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wines: public read" ON wines;
CREATE POLICY "wines: public read" ON wines FOR SELECT USING (true);
-- insert/update는 service_role만 (RLS 우회)
```

**드롭되는 기존 컬럼**: `base_*` 전부, `final_*` 8개, `vivino_description`, `vivino_grapes`, `vivino_winery`, `vivino_region`, `vivino_style`, `vivino_alcohol` (canonical 필드로 흡수됨), `naver_image`, `gangnam_alcohol`, `data_source`, `producer` (→ `producer_ko/en` 분리), `grape_variety` (→ `grape_varieties[]` 배열), `region` (→ `region_path`).

**pgvector 인덱스는 Phase 2에**: 컬럼만 만들어두고, 임베딩 배치 완료 후 `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)` 추가.

---

### 3. `pending_wines` (v2 계승, 필드 확장)

```sql
CREATE TABLE pending_wines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- wines와 동일한 정체성/분류 필드 (검색 제외라 정규화는 덜함)
  name_ko       text NOT NULL,
  name_en       text,
  producer_ko   text,
  producer_en   text,
  wine_type     text CHECK (wine_type IN ('red','white','rose','sparkling','fortified','dessert','other')),
  country       text,
  region_path   text,
  grape_varieties text[] DEFAULT '{}',
  alcohol       numeric(4,1),
  image_url     text,

  -- 승격 메타
  submitted_by     uuid REFERENCES profiles(id),
  record_count     integer DEFAULT 1,
  promoted_wine_id uuid REFERENCES wines(id) ON DELETE SET NULL,
  status           text DEFAULT 'pending' CHECK (status IN ('pending','promoted','rejected')),
  rejected_reason  text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX pending_wines_status_idx       ON pending_wines (status);
CREATE INDEX pending_wines_submitted_by_idx ON pending_wines (submitted_by);
```

**주의**: pending_wines는 **검색 인덱스 없음** (결정 #9). 사용자가 직접 입력한 와인은 본인이 자기 기록에서 참조하는 용도로만 쓰이고, 다른 사용자 검색 결과에는 노출되지 않음.

---

### 4. `wine_records` (v2 계승)

```sql
CREATE TABLE wine_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,

  -- 와인 참조 (정확히 하나)
  wine_id         uuid REFERENCES wines(id) ON DELETE SET NULL,
  pending_wine_id uuid REFERENCES pending_wines(id) ON DELETE SET NULL,
  CHECK ((wine_id IS NULL) <> (pending_wine_id IS NULL) OR deleted_at IS NOT NULL),

  -- 경험 고유 정보
  vintage    integer,
  drunk_at   date DEFAULT current_date,
  place_name text,
  latitude   numeric,
  longitude  numeric,
  companions text[],
  photos     text[] DEFAULT '{}',
  foods      jsonb DEFAULT '[]',
  tags       text[] DEFAULT '{}',

  -- 가격 (경험 시점)
  price      integer,
  price_type text CHECK (price_type IN ('market','retail')),
  price_unit text CHECK (price_unit IN ('bottle','glass')),

  -- 카탈로그 누락 필드 오버라이드 (해당 기록에만 적용)
  override_wine_type     text CHECK (override_wine_type IN ('red','white','rose','sparkling','fortified','dessert','other')),
  override_country       text,
  override_country_ko    text,
  override_region        text,
  override_region_ko     text,
  override_grape_varieties    text[],
  override_grape_varieties_ko text[],
  override_alcohol       numeric(4,1),

  -- 공유
  visibility  text DEFAULT 'private' CHECK (visibility IN ('private','link','public')),
  invite_code text UNIQUE,

  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX wine_records_user_idx       ON wine_records (user_id) WHERE deleted_at IS NULL;
CREATE INDEX wine_records_wine_idx       ON wine_records (wine_id) WHERE deleted_at IS NULL;
CREATE INDEX wine_records_pending_idx    ON wine_records (pending_wine_id) WHERE deleted_at IS NULL;
CREATE INDEX wine_records_visibility_idx ON wine_records (visibility) WHERE visibility = 'public' AND deleted_at IS NULL;
```

---

### 5. `evaluations` (v2 신규 계승)

```sql
CREATE TABLE evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid REFERENCES wine_records(id) ON DELETE CASCADE NOT NULL,

  -- 와인 (denormalized)
  wine_id         uuid REFERENCES wines(id) ON DELETE SET NULL,
  pending_wine_id uuid REFERENCES pending_wines(id) ON DELETE SET NULL,
  CHECK ((wine_id IS NULL) <> (pending_wine_id IS NULL)),

  user_id  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  nickname text,
  role     text NOT NULL CHECK (role IN ('owner','guest')),

  rating            numeric(3,1) CHECK (rating BETWEEN 0 AND 5),
  value_score       numeric(3,1) CHECK (value_score BETWEEN 0 AND 5),
  pairing_score     integer CHECK (pairing_score BETWEEN 1 AND 5),
  repurchase_intent text CHECK (repurchase_intent IN ('yes','maybe','no')),
  memo              text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (record_id, user_id)
);

CREATE INDEX evaluations_user_wine_idx ON evaluations (user_id, wine_id);
CREATE INDEX evaluations_wine_idx      ON evaluations (wine_id);
CREATE INDEX evaluations_record_idx    ON evaluations (record_id);
CREATE UNIQUE INDEX evaluations_owner_single
  ON evaluations (record_id) WHERE role = 'owner';
```

---

### 6. `wine_wishlist` (v2 계승)

```sql
CREATE TABLE wine_wishlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  wine_id         uuid REFERENCES wines(id) ON DELETE SET NULL,
  pending_wine_id uuid REFERENCES pending_wines(id) ON DELETE SET NULL,
  note       text,
  created_at timestamptz DEFAULT now(),
  CHECK ((wine_id IS NULL) <> (pending_wine_id IS NULL))
);

CREATE INDEX wine_wishlist_user_idx ON wine_wishlist (user_id);
```

---

### 7. `wines_display` (신규 view — 와인 상세 / 사전 목록용)

```sql
CREATE VIEW wines_display AS
SELECT
  w.id,
  w.name_ko, w.name_en,
  w.producer_ko, w.producer_en,
  w.wine_type,
  COALESCE(w.country_ko, w.country)            AS country_display,
  COALESCE(w.region_ko, w.region_path)         AS region_display,
  COALESCE(
    NULLIF(w.grape_varieties_ko, '{}'),
    w.grape_varieties
  )                                             AS grape_varieties_display,
  COALESCE(w.wine_style_ko, w.wine_style)      AS style_display,
  w.alcohol,
  w.image_url,
  w.vivino_url, w.vivino_rating, w.vivino_ratings_count,
  w.naver_link,
  -- 원본도 필요 시 접근 가능
  w.country, w.region_path, w.grape_varieties, w.wine_style,
  w.is_published,
  w.created_at, w.updated_at
FROM wines w;
```

UI는 이 view를 SELECT. `*_display` 필드만 쓰면 자동 한글 우선.

---

### 8. `wine_records_enriched` (v2 계승 + 한글 display 반영)

```sql
CREATE VIEW wine_records_enriched AS
SELECT
  r.*,
  -- 와인 정체성 (wines 또는 pending_wines)
  COALESCE(w.name_ko, p.name_ko)               AS wine_name_ko,
  COALESCE(w.name_en, p.name_en)               AS wine_name_en,
  COALESCE(w.producer_ko, p.producer_ko)       AS producer_ko,
  COALESCE(w.producer_en, p.producer_en)       AS producer_en,

  -- 분류 (override → wines 한글 → wines 영문 → pending)
  COALESCE(r.override_wine_type, w.wine_type, p.wine_type)                      AS wine_type,
  COALESCE(r.override_country_ko, w.country_ko, r.override_country, w.country, p.country)  AS country_display,
  COALESCE(r.override_region_ko, w.region_ko, r.override_region, w.region_path, p.region_path) AS region_display,
  COALESCE(
    NULLIF(r.override_grape_varieties_ko, '{}'),
    NULLIF(w.grape_varieties_ko, '{}'),
    NULLIF(r.override_grape_varieties, '{}'),
    w.grape_varieties,
    p.grape_varieties
  )                                                                              AS grape_varieties_display,
  COALESCE(w.wine_style_ko, w.wine_style)                                        AS style_display,
  COALESCE(r.override_alcohol, w.alcohol, p.alcohol)                             AS alcohol,
  COALESCE(w.image_url, p.image_url)                                             AS image_url,
  (w.id IS NOT NULL)                                                             AS is_catalog_wine,

  -- owner 평가
  oe.rating, oe.value_score, oe.pairing_score, oe.repurchase_intent,
  oe.memo AS evaluation_memo
FROM wine_records r
LEFT JOIN wines w         ON r.wine_id = w.id
LEFT JOIN pending_wines p ON r.pending_wine_id = p.id
LEFT JOIN evaluations oe  ON oe.record_id = r.id AND oe.role = 'owner';
```

---

### 9. `raw_wines` (v2 계승, 앱 미참조)

현재 구조 유지. promote 스크립트에서만 읽기.

**단, promote-wines.ts가 다음을 수행하도록 수정**:
- Vivino 영문 필드(`vivino_region`, `vivino_grapes`, `vivino_style`) → `term_dict` 룩업 → `wines.region_ko`, `grape_varieties_ko`, `wine_style_ko` 채움
- 사전 miss 시 `*_ko = NULL` + `raw_wines.needs_translation = true` 플래그 (컬럼 추가 필요)
- LLM 파싱 결과(`parsed_brand`, `winery_en_clean`, `parsed_search_query`) → `wines.brand`, `winery_en_clean`, `search_query_en` 채움

---

## 검색 인프라

### RPC 함수: `search_wines`

```sql
CREATE OR REPLACE FUNCTION search_wines(
  q text DEFAULT NULL,
  filter_wine_type  text DEFAULT NULL,
  filter_country_ko text DEFAULT NULL,
  filter_grapes_ko  text[] DEFAULT NULL,     -- 와인 사전: 선택된 품종 목록 (OR 매칭)
  filter_price_min  integer DEFAULT NULL,
  filter_price_max  integer DEFAULT NULL,
  q_embedding       vector(1024) DEFAULT NULL,  -- Phase 2 활성화
  k integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  name_ko text, name_en text,
  country_display text, region_display text,
  grape_varieties_display text[],
  style_display text,
  wine_type text, alcohol numeric,
  image_url text,
  vivino_rating numeric, vivino_ratings_count integer,
  score real
)
LANGUAGE sql STABLE AS $$
  WITH q_tsquery AS (
    SELECT CASE
      WHEN q IS NULL OR length(q) < 2 THEN NULL
      ELSE websearch_to_tsquery('simple', q)
    END AS tsq
  ),
  scored AS (
    SELECT
      w.id,
      w.name_ko, w.name_en,
      -- tsvector 랭크
      CASE WHEN (SELECT tsq FROM q_tsquery) IS NOT NULL
        THEN ts_rank(w.search_tsv, (SELECT tsq FROM q_tsquery))
        ELSE 0 END AS ts_rank,
      -- trigram 유사도 (한글 쿼리 보완)
      CASE WHEN q IS NOT NULL
        THEN GREATEST(
          similarity(w.name_ko, q),
          similarity(coalesce(w.name_en,''), q)
        )
        ELSE 0 END AS trgm_sim,
      -- 벡터 유사도 (Phase 2)
      CASE WHEN q_embedding IS NOT NULL AND w.embedding IS NOT NULL
        THEN 1 - (w.embedding <=> q_embedding)
        ELSE 0 END AS vec_sim,
      -- 인기도 부스트 (0~1 정규화)
      LEAST(
        1.0,
        (coalesce(w.vivino_rating,0) * ln(1 + coalesce(w.vivino_ratings_count,0))) / 30.0
      ) AS popularity,
      w.*
    FROM wines w
    WHERE w.is_published = true
      AND (filter_wine_type  IS NULL OR w.wine_type = filter_wine_type)
      AND (filter_country_ko IS NULL OR w.country_ko = filter_country_ko)
      AND (filter_grapes_ko  IS NULL OR w.grape_varieties_ko && filter_grapes_ko)
      AND (filter_price_min  IS NULL OR TRUE)  -- 가격은 wine_records 기반이라 별도 처리, wines에 price 컬럼 추가 필요 시 확장
      AND (
        q IS NULL OR
        (SELECT tsq FROM q_tsquery) IS NULL OR
        w.search_tsv @@ (SELECT tsq FROM q_tsquery) OR
        w.name_ko % q OR
        coalesce(w.name_en,'') % q
      )
  )
  SELECT
    s.id,
    s.name_ko, s.name_en,
    COALESCE(s.country_ko, s.country)    AS country_display,
    COALESCE(s.region_ko, s.region_path) AS region_display,
    COALESCE(NULLIF(s.grape_varieties_ko,'{}'), s.grape_varieties) AS grape_varieties_display,
    COALESCE(s.wine_style_ko, s.wine_style) AS style_display,
    s.wine_type, s.alcohol,
    s.image_url,
    s.vivino_rating, s.vivino_ratings_count,
    -- 최종 스코어 (키워드 우선, 인기도/벡터 보강)
    (s.ts_rank * 2.0 + s.trgm_sim * 1.0 + s.vec_sim * 0.5 + s.popularity * 0.3)::real AS score
  FROM scored s
  WHERE (
    q IS NULL  -- 필터만 있는 경우
    OR s.ts_rank > 0.01
    OR s.trgm_sim > 0.25
  )
  ORDER BY score DESC
  LIMIT k;
$$;
```

**설계 메모**:
- `q` NULL → 필터만으로 탐색 (와인 사전 용)
- `q` 존재 → 키워드 검색 + 필터 조합
- precision 우선: `ts_rank > 0.01` + `trgm > 0.25` 컷오프로 노이즈 차단
- 인기도는 "보조 가산"이지 주 스코어 아님 (precision 기준 유지)

### 필터 옵션 RPC: `dictionary_filter_options`

와인 사전 UI의 필터 드롭다운 데이터를 한 번에 제공:

```sql
CREATE OR REPLACE FUNCTION dictionary_filter_options(
  filter_wine_type text DEFAULT NULL  -- "레드 선택 시 레드 품종만" 용
)
RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'wine_types', (
      SELECT jsonb_agg(jsonb_build_object('value', wine_type, 'count', c))
      FROM (
        SELECT wine_type, count(*) AS c
        FROM wines WHERE is_published AND wine_type IS NOT NULL
        GROUP BY wine_type ORDER BY c DESC
      ) t
    ),
    'countries', (
      SELECT jsonb_agg(jsonb_build_object('value', country_ko, 'count', c))
      FROM (
        SELECT country_ko, count(*) AS c
        FROM wines
        WHERE is_published AND country_ko IS NOT NULL
          AND (filter_wine_type IS NULL OR wine_type = filter_wine_type)
        GROUP BY country_ko ORDER BY c DESC
      ) t
    ),
    'grapes', (
      SELECT jsonb_agg(jsonb_build_object('value', grape, 'count', c))
      FROM (
        SELECT unnest(grape_varieties_ko) AS grape, count(*) AS c
        FROM wines
        WHERE is_published
          AND (filter_wine_type IS NULL OR wine_type = filter_wine_type)
        GROUP BY grape ORDER BY c DESC
      ) t
      WHERE grape IS NOT NULL
    )
  );
$$;
```

**핵심 포인트**: `filter_wine_type` 파라미터로 **품종 필터가 타입 의존**이 됨. 레드 선택 시 레드 와인에 실제 존재하는 품종만 반환.

---

## UI 변경

### 1. 와인 상세 (`src/app/(app)/wines/[id]/page.tsx`)

- 쿼리 대상: `wines_display` view
- 섹션 헤더: "Wine Details" → **"와인 상세"**
- 표시 필드: `country_display`, `region_display`, `grape_varieties_display`, `style_display`, `alcohol`, `producer_ko/en`
- 3중 cascade 로직(`resolveWineDisplay`) **제거**

### 2. 와인 기록 상세 (`src/app/(app)/diary/[id]/DiaryDetail.tsx`)

- 쿼리 대상: `wine_records_enriched` view
- 섹션 헤더: "Wine" → **"와인"**
- 표시 필드: view의 `*_display` 필드 사용
- `src/lib/wine-display.ts`의 `resolveWineDisplay` **제거**, `TYPE_KO`는 유지

### 3. 새 와인 사전 페이지 (`src/app/(app)/dictionary/page.tsx`)

**레이아웃**:
```
┌─────────────────────────────────────┐
│ 검색창: [와인명 입력...]            │
├─────────────────────────────────────┤
│ 필터:                                │
│  [와인 타입 ▼] [국가 ▼]             │
│  [품종 ▼ (타입 선택 시 활성화)]     │
│  [가격 범위: ____ ~ ____]           │
├─────────────────────────────────────┤
│ 결과 목록 (무한 스크롤):             │
│  · 카드 (이미지, 한글명, 영문명,     │
│    국가·지역, 품종, Vivino 평점)    │
└─────────────────────────────────────┘
```

**클라이언트 로직**:
1. 페이지 진입 시 `dictionary_filter_options()` 호출 → 필터 옵션 세팅
2. 와인 타입 변경 시 `dictionary_filter_options(filter_wine_type)` 재호출 → 품종 목록 갱신
3. 검색어/필터 변경 시 `search_wines(...)` 호출 (디바운스 300ms)
4. 카드 클릭 → `/wines/[id]` 이동

**진입점**:
- 네비게이션 메뉴에 "와인 사전" 항목 추가
- `/find`와의 통합은 후행 결정

---

## 드롭 대상

### 테이블
- `sessions`, `session_evaluations`, `session_comments` (v2 계승)
- `record_evaluations` (→ `evaluations`로 이관 후 드롭)

### 컬럼 (wines — **in-place ALTER로 DROP COLUMN**, 테이블 자체는 유지)
- `base_*`, `final_*` 전부
- `vivino_description`, `vivino_grapes`, `vivino_winery`, `vivino_region`, `vivino_style`, `vivino_alcohol` (canonical로 흡수)
- `naver_image`, `gangnam_alcohol`, `data_source`
- `producer` (→ `producer_ko/en`), `grape_variety` (→ `grape_varieties[]`), `region` (→ `region_path`)
- **`is_published`** (현재 코드 미참조, RLS가 유일한 사용처 → `USING (true)`로 대체)

> ⚠️ **wines 테이블 자체는 DROP하지 않음.** 기존 wine_id 보존으로 FK 재매칭 불필요. 상세는 "기존 데이터 영향 분석" 섹션 참조.

### 컬럼 (wine_records)
- `name`, `wine_name_original`
- `wine_type`, `wine_country`, `grape_variety`, `wine_vivino_url`
- `rating`, `value_score`, `pairing_score`, `memo`, `repurchase_intent` (→ evaluations)
- `location` (→ `place_name` 일원화)

### 코드
- `src/app/(app)/session/**`, `src/lib/actions/session.ts`
- `src/lib/wine-display.ts`의 `resolveWineDisplay` (뷰로 대체, `TYPE_KO`는 유지)

---

## 기존 데이터 영향 분석 및 보존 전략

### 영향 매트릭스 (와인 기록 관점)

| 영역 | 보존 여부 | 변경 내용 | 위험 | 완화 |
|---|---|---|---|---|
| 사진(photos) | ✅ 완전 보존 | - | 낮음 | 컬럼 유지, URL 변경 없음 |
| 빈티지·음주일·장소명·가격·태그·동반자·음식 | ✅ 완전 보존 | - | 낮음 | 컬럼 유지 |
| 공유 링크(invite_code), visibility | ✅ 완전 보존 | - | 낮음 | 컬럼 유지 |
| wishlist 항목 | ✅ FK 보존 | `name_ko/en` 컬럼 드롭 | 낮음 | in-place ALTER로 wine_id 유지 |
| 장소(`location`) | 값 보존 | `place_name`으로 컬럼명 변경 | 중간 | UPDATE로 이관, 구 컬럼은 Phase 5 이후 DROP |
| 평가(`rating`/`memo`/`value_score`/`pairing_score`/`repurchase_intent`) | 값 보존 | `wine_records` → `evaluations` 테이블로 이관 | **높음** | 건수 일치 쿼리 + 샘플 20건 수작업 확인 |
| 게스트 평가(`record_evaluations`) | 값 보존 | → `evaluations (role='guest')` | **높음** | 위와 동일 |
| `wine_id` FK | ✅ **완전 보존** | (in-place ALTER 덕분에 ID 불변) | 낮음 | DROP CASCADE 포기가 핵심 |

### wines 테이블 — 이원 소스 문제 (baseline 실측 2026-04-20)

현재 `wines` 36,410건의 내역:

| 출처 (`data_source`) | wines 건수 | raw_wines 동일 소스 존재? | 필수 5개 필드 충족 | 백필 후 기대치 |
|---|---|---|---|---|
| wine21 | 32,917 | ✅ raw_wines에 34,986건 (미연결 상태) | 0 (0%) | ~32,700 (raw_wines에서 끌어옴) |
| naver_shopping | 2,762 | ❌ 없음 | 2,476 (89.6%) | 2,476 |
| winenara | 728 | ❌ 없음 | 380 (52.2%) | 380 (country/grape 추가 보강 시 증가 가능) |
| user_submission | 3 | ❌ 없음 | 3 (100%) | 3 |
| **합계** | **36,410** | 혼재 | **2,859 (7.9%)** | **~36,752** |

**raw_wines 측(36,822건)의 현황**:
- `wine21` 34,986건: `promoted_wine_id`가 전부 NULL (wines와 FK 연결 끊김) → name_ko로 93.7% 매칭 가능
- `gangnam` 1,836건: wines로 promote 안 됨 (대기). 필수 5개 필드 충족 1,193건 (65%)

**wine21 단독 특수성**:
- wines에는 이름(name_ko, name_en)만 있고 wine_type/country/grape_variety가 100% NULL
- 실제 데이터는 `raw_wines.wine_type` / `.country`, 그리고 `raw_wines.raw_payload.parsed_grape_varieties[]` (LLM 파싱 결과)에 존재
- → Phase 3 백필에서 raw_wines로부터 끌어와 채워야 기준 충족

→ **"wines DROP → raw_wines에서 재promote" 전략은 naver/winenara/user_submission 3,493건을 손실시킴.**

### 채택된 전략: **in-place ALTER** (DROP 금지)

- `wines` **테이블 자체는 유지**. 컬럼 구조만 변경 (ADD → UPDATE → DROP 순서).
- 모든 wine UUID가 보존됨 → `wine_records.wine_id` FK 재매칭 **불필요**.
- `search_tsv`는 `ADD COLUMN ... GENERATED ALWAYS AS (...) STORED`로 추가.
- 아키텍처 정리 차원에서 raw_wines에 없는 wines 행은 **역이관**으로 raw_wines에 백필.

### 역이관 + 연결 백필 (Phase 2 진입 직전)

두 개의 서로 다른 정정 작업을 **반드시** 순서대로 실행:

#### (1) 역이관 — legacy 소스 전수 백필 (naver/winenara/user_submission 3,493건)

> ⚠️ **기준 충족 여부와 무관하게 전부** 역이관. Phase 3 백필 후 wines에서 DELETE되더라도 raw_wines에 원본이 영구 보존되어야 향후 보강 시 재 promote 가능.

```sql
-- legacy 3,493건을 raw_wines로 전수 복사
INSERT INTO raw_wines (source, source_id, name_ko, name_en, wine_type, country,
                        region, grape_variety, producer, description, price,
                        image_url, vivino_url, vivino_wine_id, vivino_rating,
                        vivino_reviews, promoted_wine_id, promoted_at,
                        raw_payload, collected_at)
SELECT
  w.data_source AS source,                         -- 'naver_shopping' | 'winenara' | 'user_submission'
  w.id::text AS source_id,                         -- 기존 wines UUID를 source_id로
  w.name_ko, w.name_en, w.wine_type, w.country,
  w.region, w.grape_variety, w.producer, w.description, w.price,
  w.naver_image AS image_url,
  w.vivino_url, w.vivino_wine_id, w.vivino_rating,
  NULL,                                            -- vivino_reviews 기존에 없음
  w.id AS promoted_wine_id,                        -- 바로 연결 (이미 wines에 존재하므로)
  w.created_at AS promoted_at,
  jsonb_build_object(
    'backfilled_from_wines', true,
    'original_data_source', w.data_source,
    'meets_v3_required_fields',
      (w.name_ko IS NOT NULL AND w.name_en IS NOT NULL
       AND w.wine_type IS NOT NULL AND w.country IS NOT NULL
       AND w.grape_variety IS NOT NULL)
  ) AS raw_payload,
  w.created_at AS collected_at
FROM wines w
WHERE w.data_source IN ('naver_shopping', 'winenara', 'user_submission');
-- 예상: 3,493건 INSERT
```

#### (2) 연결 백필 — wine21 `raw_wines.promoted_wine_id` 채움

```sql
-- name_ko 정확 매칭으로 raw_wines(wine21)의 promoted_wine_id 백필
UPDATE raw_wines r
SET promoted_wine_id = w.id,
    promoted_at = COALESCE(r.promoted_at, w.created_at)
FROM wines w
WHERE r.source = 'wine21'
  AND r.promoted_wine_id IS NULL
  AND w.data_source = 'wine21'
  AND trim(r.name_ko) = trim(w.name_ko);
-- 예상: 32,776건 업데이트 (baseline 93.7% 매칭)
```

#### (3) wines.source_refs 보정 (자기 참조 기록)

```sql
UPDATE wines w
SET source_refs = coalesce(source_refs, '{}'::jsonb) ||
  jsonb_build_object('self_raw_id',
    (SELECT r.id::text FROM raw_wines r WHERE r.promoted_wine_id = w.id LIMIT 1));
```

#### (4) 검증 쿼리

```sql
-- 역이관 후 커버리지: 0이어야 함
SELECT count(*) AS orphan_wines
FROM wines w
WHERE NOT EXISTS (SELECT 1 FROM raw_wines r WHERE r.promoted_wine_id = w.id);
-- 0이 아니면 wine21 name_ko 이름 불일치 (~7,642건 예상) → 유사도 매칭 재시도
```

**유사도 매칭(잔여 7,642건 예상)** — 별도 스크립트 `scripts/fuzzy-rematch-wine21.ts`로 처리:
- `similarity()` (pg_trgm), 공백/특수문자 정규화, 영문 매칭 병용
- 95% 이상 유사도 → 자동 매핑
- 80~95% → 수동 확인 리포트
- 80% 미만 → wines에만 존재하는 "고아 행"으로 남겨 raw_wines로 역이관 (legacy와 동일 방식)

### in-place ALTER 마이그레이션 규칙

| 기존 컬럼/상태 | 처리 방법 |
|---|---|
| `grape_variety text` | `ADD grape_varieties text[] DEFAULT '{}'`; `UPDATE SET grape_varieties = string_to_array(grape_variety, ', ') WHERE grape_variety IS NOT NULL`; wine21은 Phase 3에서 `raw_payload.parsed_grape_varieties` 배열로 대체 채움; 구 컬럼 DROP |
| `region text` | `ALTER ... RENAME COLUMN region TO region_path` |
| `producer text` | `ADD producer_ko, producer_en`; 한글 감지 룰로 분리(기존 값이 한글이면 producer_ko, 영문이면 producer_en, 혼재면 LLM 배치) |
| `base_*`, `final_*`, `vivino_description/grapes/winery/region/style/alcohol` | `DROP COLUMN`. 단 Phase 3 백필이 끝난 후 실행 |
| `naver_image` | `ADD image_url text`; `UPDATE SET image_url = naver_image`; 구 컬럼 DROP |
| **`is_published`** | Phase 3 백필 + 기준 미달 DELETE 완료 후 DROP. RLS 정책 `USING (is_published = true)` → `USING (true)`로 미리 변경 (DROP 전에) |
| `data_source` | `ALTER ... RENAME COLUMN data_source TO source`; CHECK 제약 추가 |
| `winery_en_clean`, `brand`, `search_query_en` | `ADD` (NULL 허용). Phase 3에서 raw_wines의 LLM 파싱 결과로 채움 |
| `country_ko`, `region_ko`, `grape_varieties_ko`, `wine_style_ko` | `ADD` (NULL 허용). Phase 3에서 term_dict 룩업으로 채움 |
| **필수 필드 NOT NULL 제약** | Phase 3 백필 + 기준 미달 DELETE 완료 **후에만** 적용 (`ALTER ... ALTER COLUMN ... SET NOT NULL`, `ADD CHECK (array_length(grape_varieties,1) >= 1)`) |
| `search_tsv` | `ADD COLUMN ... GENERATED ALWAYS AS (...) STORED`. 다른 컬럼 채움 완료 후 추가 (generated는 추가 즉시 전량 재계산됨) |
| `embedding vector(1024)` | `ADD` NULL 허용. Phase 7에서 배치로 채움 |

### Phase별 Rollback 시나리오

| Phase | 실패 유형 | Rollback 경로 |
|---|---|---|
| 0 (백업) | 덤프 실패 | 중단, 디스크/권한 확인 후 재시도 |
| 1 (term_dict) | LLM 생성 오류 | `DROP TABLE term_dict` + 재실행. **wines 미변경** |
| 2 (스키마 ALTER) | ALTER 도중 실패 | 트랜잭션 `ROLLBACK`. 필요 시 Phase 0 덤프에서 wines 테이블만 복원. wine_id 보존되므로 wine_records 영향 없음 |
| 3 (백필/promote) | `*_ko` 잘못 채움 | `UPDATE wines SET country_ko=NULL, region_ko=NULL, ...` 전체 리셋 후 재실행. **wines 행 삭제 없음** |
| 4 (평가 이관) | 이관 누락 | 이관 전 wine_records/record_evaluations 덤프에서 복원. evaluations `TRUNCATE` 후 재실행 |
| 5~6 (코드/사전) | 런타임 오류 | 앱만 이전 배포로 롤백. DB는 신 스키마 유지 (view·RPC가 하위 호환성 제공) |
| 7 (벡터) | 임베딩 실패 | embedding 컬럼 NULL로 두고 키워드 검색만 사용 — 랭킹 식에서 `vec_sim * 0.5` 항이 0이 됨, 기능 지속 |

### 개발 환경 리허설 체크리스트

> ⚠️ **실행 환경이 프로덕션만 있음** (2026-04-20 확인). 리허설은 **개발 Supabase 프로젝트 새로 생성** 또는 **프로덕션 덤프 → 로컬 Supabase 복원**으로 수행 필요. 프로덕션 직접 실행 금지.

**본 실행 전에 반드시 수행**:

- [ ] 프로덕션 DB 전체 덤프 → 리허설 환경 복원 (Supabase CLI `supabase db dump` / `db reset` 활용)
- [ ] Phase 0~8 전 과정 드라이런
- [ ] **역이관 커버리지 = 100%**: `SELECT count(*) FROM wines WHERE NOT EXISTS (SELECT 1 FROM raw_wines r WHERE r.promoted_wine_id = wines.id)` == 0
- [ ] **wine_records XOR 위반 = 0**: `SELECT count(*) FROM wine_records WHERE wine_id IS NOT NULL AND pending_wine_id IS NOT NULL AND deleted_at IS NULL` == 0
- [ ] **필수 필드 충족률 = 100%** (Phase 3 TX-8 이후): `SELECT count(*) FROM wines WHERE name_en IS NULL OR wine_type IS NULL OR country IS NULL OR grape_varieties = '{}'` == 0
- [ ] **기준 미달 DELETE 시 참조 wine_records 보호됨**: wine_records view 조회 시 name/type/country 정상 표시 (override에서 읽힘)
- [ ] **평가 이관 건수 일치**: 이관 전 `wine_records.rating NOT NULL` 건수 == `evaluations (role='owner', rating NOT NULL)` 건수
- [ ] **location → place_name 이관**: 이관 전 `location NOT NULL` 건수 == `place_name NOT NULL` 건수
- [ ] **한글화 커버율 ≥ 90%**: `SELECT avg(CASE WHEN country_ko IS NOT NULL AND grape_varieties_ko <> '{}' THEN 1 ELSE 0 END) FROM wines`
- [ ] **예상 wines 최종 건수 ≈ 18,852±200**: wine21 vivino_grapes 14,800 + legacy 2,859 + gangnam 1,193. 나머지 ~21,463은 raw_wines 대기
- [ ] 샘플 20건 UI 표시 수동 확인 (와인 상세, 기록 상세, 사전)
- [ ] 기존 `/find` 결과 vs 새 `search_wines` RPC 결과 비교 (동일 쿼리 10개)
- [ ] 회귀 테스트: 찜 추가/삭제, 어드민 편집, 공유 링크, 푸시
- [ ] RLS `USING (true)` 전환 후 anon 키로 `wines` 조회 가능 확인

---

## 실행 플랜

### Phase 0: 사전 준비 (반나절)
1. 백업 — 전체 테이블 JSON 덤프 (`/tmp/winerary-backup-v3-YYYYMMDD/`)
2. pgvector, pg_trgm 확장 활성화 확인 (`CREATE EXTENSION IF NOT EXISTS ...`)

### Phase 1: term_dict 구축 (반나절~하루)
3. `scripts/build-term-dict.ts` 작성 → LLM 일괄 생성
4. 수작업 검증 → `verified=true` 마킹 (특히 region/grape)
5. 사용 패턴 테스트 (`term_dict_lookup.ts` 헬퍼 유닛 테스트)

### Phase 2: 스키마 재구성 — **in-place ALTER** (하루~이틀)
6. **역이관 + 연결 백필 실행** (위 SQL 1~4). 트랜잭션 1.
   - legacy 3,493건 → raw_wines로 전수 복사
   - wine21 `promoted_wine_id` 32,776건 백필
   - 잔여 ~7,642건 유사도 매칭 (별도 스크립트)
7. **wine_records XOR 위반 7건 정리** (트랜잭션 1.5, Phase 2 CHECK 제약 추가 전 선행):
   ```sql
   UPDATE wine_records
   SET pending_wine_id = NULL
   WHERE wine_id IS NOT NULL AND pending_wine_id IS NOT NULL AND deleted_at IS NULL;
   ```
   → wine_id 우선 원칙 (baseline에서 wine_id 쪽이 canonical 매칭일 가능성 높음). 변경 로그 남김.
8. 마이그레이션 SQL 작성 (`supabase/migrations/20260501_v3_redesign.sql`). 여러 트랜잭션으로 분리:
   - **TX-2 (세션 드롭)**: `DROP TABLE sessions, session_evaluations, session_comments CASCADE`
   - **TX-3 (RLS 단순화 선제)**: `DROP POLICY "wines: public read" ON wines; CREATE POLICY ... USING (true)` — Phase 3 백필 중에도 앱이 와인을 볼 수 있도록
   - **TX-4 (wines ADD)**: 신규 컬럼 (정규화 영문, 한글 4개, embedding). `search_tsv`, NOT NULL 제약은 아직 추가 안 함
   - **TX-5 (wines DATA 이관)**: `grape_variety → grape_varieties[]` (NULL이면 빈 배열 유지), `region → region_path rename`, `producer → ko/en split`, `naver_image → image_url`, `data_source → source rename`
   - **(Phase 3 후) TX-6 (wines 구 컬럼 DROP)**: `base_*`, `final_*`, `vivino_description` 등 + `is_published` DROP
   - **(Phase 3 후) TX-7 (기준 미달 wines DELETE)**: 백필 후에도 필수 5개 필드 미달인 행 삭제. 삭제 전 `override_*` 보호 UPDATE 선행
   - **(Phase 3 후) TX-8 (NOT NULL + CHECK 제약 추가)**: `name_en`, `wine_type`, `country` `SET NOT NULL`; `grape_varieties` CHECK 추가
   - **(Phase 3 후) TX-9 (wines GENERATED)**: `search_tsv` generated 컬럼 ADD + 인덱스 생성
   - **TX-10 (pending_wines)**: 필드 확장
   - **TX-11 (wine_records)**: override 컬럼 추가, XOR CHECK 제약 추가 (#7 선행이 전제). 구 컬럼은 Phase 4 완료 후 DROP
   - **TX-12 (evaluations)**: CREATE + 인덱스
   - **TX-13 (wine_wishlist)**: `name_ko`/`name_en` DROP
   - **TX-14 (view/RPC)**: `wines_display`, `wine_records_enriched`, `search_wines`, `dictionary_filter_options`

### Phase 3: 기존 wines 보강 + gangnam promote (하루~이틀)
9. `scripts/backfill-wines-v3.ts` — **wines 전체 행** 대상:
   - `grape_varieties[]` 채우기 우선순위 (**precision 우선, parsed fallback 금지**):
     1. `raw_payload.vivino_grapes` (원본 Vivino 데이터, 비율 포함) → **정규식으로 비율 제거 후 배열화**
     2. `wines.grape_variety` (legacy 기존값) → 쉼표 분리 + 비율 제거
     3. `raw_wines.grape_variety` (gangnam 등의 원본 필드) → 쉼표 분리 + 비율 제거
     4. **`parsed_grape_varieties`는 사용하지 않음** — 와인명에서 추출한 것이라 실제 블렌드 반영 X. 이름에 품종이 보이더라도 실제 와인 품종은 다를 수 있음
   - 위 1~3 전부 없으면 → 기준 미달 → Phase 3 정리에서 DELETE 후 raw_wines에 대기
   - `wine_type`, `country` ← raw_wines에서 보강 (wine21 전수)
   - `winery_en_clean`, `brand`, `search_query_en` ← raw_wines.raw_payload의 LLM 파싱 결과 (이것들은 검색 인덱싱용이라 parsed 사용 OK)
   - `country_ko`, `region_ko`, `grape_varieties_ko`, `wine_style_ko` ← term_dict 룩업
   - 사전 miss → `needs_translation=true` 플래그

   정규식 정제 함수:
   ```ts
   function cleanGrapeString(s: string): string[] {
     return s
       .split(/[,;]/)
       .map(x =>
         x.replace(/^\s*\d+(?:\.\d+)?\s*%\s*/, "")     // "40% Pinot Noir" → "Pinot Noir"
          .replace(/\s*\d+(?:\.\d+)?\s*%\s*$/, "")     // "메를로 40%" → "메를로"
          .replace(/\s*\([^)]*\)\s*/g, " ")            // "메를로 (Merlot)" → "메를로"
          .trim()
       )
       .filter(x => x.length > 0 && !/^[\d%.\s]+$/.test(x));
   }
   ```

   **wines legacy vivino_* 정제 SQL** (Phase 2 TX-5 또는 Phase 3 초반):
   ```sql
   -- 1) vivino_page_url 있는 행: canonical vivino_url로 이동
   UPDATE wines
   SET vivino_url = vivino_page_url
   WHERE vivino_page_url IS NOT NULL;

   -- 2) vivino_url만 있고 page_url 없는 행 (검색 URL 의심분): vivino_* 전부 null
   UPDATE wines
   SET vivino_url = NULL,
       vivino_wine_id = NULL,
       vivino_rating = NULL,
       vivino_ratings_count = NULL
   WHERE vivino_page_url IS NULL
     AND (vivino_url IS NOT NULL OR vivino_wine_id IS NOT NULL);

   -- 3) vivino_page_url 컬럼은 Phase 3 후 DROP
   -- ALTER TABLE wines DROP COLUMN vivino_page_url;
   ```

   **raw_wines**: 정제 불필요. `raw_payload.vivino_url`은 v4 재매칭으로 수집된 Vivino 상세 URL(`/en/<slug>/w/<wine_id>` 패턴) 확인됨 (2026-04-20 실측, 샘플 1,000건 100%).

   **기대 건수 (2026-04-20 baseline + (B) 방침 시뮬레이션)**:
   - wine21: **~14,800건** 기준 충족 (vivino_grapes 보유)
   - gangnam: **~1,193건** (grape_variety 자체 + 나머지 필수 필드)
   - naver_shopping: 2,476 / winenara: 380 / user_submission: 3
   - **최종 wines ≈ 18,852건** (이전 예상 36,750에서 감소 — 정확도 보장 와인만 남김)
   - **raw_wines 대기 ≈ 21,463건** — Vivino 재크롤·수작업 보강으로 점진 승격 가능
10. `scripts/promote-gangnam.ts` — raw_wines의 gangnam 1,193건(필수 필드 충족분)을 wines로 신규 INSERT. 나머지 643건은 raw_wines에 대기.
11. `scripts/retranslate-missing.ts` — `needs_translation=true` 건 LLM fallback → term_dict 확장 → 재백필
12. **기준 미달 wines의 override 보호 + DELETE** (TX-7):
    ```sql
    -- (a) 참조 중인 wine_records에 기존 값을 override로 복사 (UI 보호)
    UPDATE wine_records r
    SET override_wine_type    = coalesce(r.override_wine_type, w.wine_type),
        override_country      = coalesce(r.override_country, w.country),
        override_region       = coalesce(r.override_region, w.region_path),
        override_grape_varieties = coalesce(NULLIF(r.override_grape_varieties,'{}'), w.grape_varieties),
        override_alcohol      = coalesce(r.override_alcohol, w.alcohol)
    FROM wines w
    WHERE r.wine_id = w.id
      AND r.deleted_at IS NULL
      AND (w.name_en IS NULL OR w.wine_type IS NULL OR w.country IS NULL
           OR w.grape_varieties = '{}' OR array_length(w.grape_varieties,1) IS NULL);

    -- (b) wishlist도 동일 보호? — wishlist엔 override 컬럼 없으므로 pending_wines로 이동 or null 세팅
    UPDATE wine_wishlist ww
    SET wine_id = NULL
    FROM wines w
    WHERE ww.wine_id = w.id
      AND (w.name_en IS NULL OR w.wine_type IS NULL OR w.country IS NULL
           OR w.grape_varieties = '{}' OR array_length(w.grape_varieties,1) IS NULL);

    -- (c) 기준 미달 wines DELETE (raw_wines에는 원본 보존됨)
    DELETE FROM wines w
    WHERE w.name_en IS NULL OR w.wine_type IS NULL OR w.country IS NULL
       OR w.grape_varieties = '{}' OR array_length(w.grape_varieties,1) IS NULL;
    ```
    → wine_records의 `wine_id`는 ON DELETE SET NULL로 자동 NULL. 이후 pending_wines로 이관할지 결정은 Phase 4에서.
13. 백필 결과 검증: 필수 필드 5개 모두 충족 비율 ≥ 98% (기준 미달 DELETE 전 수치 기준)
14. `scripts/promote-wines.ts` 재작성 — **신규 crawl 이후** raw_wines 행을 wines로 INSERT/UPSERT. 기준 충족 시에만 INSERT. 미달이면 raw_wines에 대기.

### Phase 4: 평가 이관 + 위치 통합 + 끊긴 참조 처리 (반나절)
15. `scripts/migrate-evaluations.ts` — `wine_records.rating/value_score/pairing_score/memo/repurchase_intent` → `evaluations (role='owner')`, `record_evaluations` → `evaluations (role='guest')`, `record_evaluations` DROP
16. `scripts/backfill-location.ts` — `UPDATE wine_records SET place_name = coalesce(place_name, location)`
17. **끊긴 wine_id 처리** (Phase 3 TX-7에서 기준 미달 DELETE로 wine_id=NULL이 된 건):
    ```sql
    -- override 필드 보유한 wine_records를 pending_wines로 이관
    -- (이미 Phase 3에서 override 보호 UPDATE가 끝났으므로 name_ko 등이 override에 저장됨)
    -- 단 현재 wine_records 스키마는 override에 name을 두지 않음 → 이 경우 해당 record 자체를 pending으로 전환
    ```
    → 구체 로직은 실행 단계에서 baseline 재확인 후 결정. 현재 wine_records 48건 중 영향받는 건 최대 7건(기준 미달 참조분)으로 규모 작음.
18. 검증: 건수 일치 쿼리, 샘플 확인 (리허설 체크리스트 항목)
19. wine_records의 구 컬럼(`rating`, `memo`, `location`, `name`, `wine_name_original`, `wine_type`, `wine_country`, `grape_variety`, `wine_vivino_url`, `value_score`, `pairing_score`, `repurchase_intent`) DROP — **Phase 5 코드 적응 완료 후 안정화 확인 시점에 실행**

> 💡 **참고**: v2에서 필요했던 "wine_id 재매칭(rematch-fks.ts)"은 in-place ALTER 덕분에 **불필요**. wine_id 보존됨 (기준 미달 DELETE로 일부만 NULL).

### Phase 5: 코드 적응 (1~2일)
12. 타입 정의 갱신 (`src/types/`)
13. `src/app/(app)/wines/[id]/page.tsx` → view 기반
14. `src/app/(app)/diary/[id]/DiaryDetail.tsx` → view 기반
15. `src/lib/wine-display.ts` 정리
16. `src/app/api/wines/search/route.ts` → `search_wines` RPC 호출
17. `src/lib/wine-search.ts` → RPC wrapper로 대체
18. grep으로 구 컬럼 참조(`final_*`, `vivino_description` 등) 전부 수정

### Phase 6: 와인 사전 기능 (1~2일)
19. `src/app/(app)/dictionary/page.tsx` 작성
20. 필터 UI 컴포넌트 (`DictionaryFilters.tsx`)
21. 결과 카드 컴포넌트 (`WineCard.tsx` — 기존 재활용 가능하면 재활용)
22. 네비게이션에 진입점 추가

### Phase 7: 벡터 검색 활성화 (후행)
23. 임베딩 모델 최종 결정 (Voyage voyage-3-lite 권장)
24. `scripts/embed-wines.ts` — 35K 건 임베딩 (예상 비용 < $0.50)
25. `CREATE INDEX wines_embedding_hnsw_idx ON wines USING hnsw (embedding vector_cosine_ops)`
26. RPC에서 `q_embedding` 활용 경로 활성화, 임베딩 API 호출 추가

### Phase 8: 검증 및 정리
27. 데이터 검증 쿼리 (리허설 체크리스트 항목 전수 재실행)
   - 필수 필드 충족률 100% (NOT NULL 제약으로 보장)
   - 역이관 커버리지 0건
   - 평가/위치 이관 건수 일치
   - XOR 위반 0건
   - 한글화 커버율 ≥ 90%
   - wines 최종 건수 ≈ 36,750±200
28. 수동 UI 테스트
   - 와인 상세 한글 표시 (`/wines/[id]`)
   - 와인 기록 상세 한글 표시 (`/diary/[id]`)
   - 키워드 검색 (`/find`) + 새 RPC 결과 품질
   - 와인 사전 — 필터 조합, 타입 의존 품종 필터
   - 어드민 편집, 찜, 공유 등 기존 기능 회귀
29. wine_records 구 컬럼 DROP (Phase 4 step 19 연기분) — 1~2주 안정화 후
30. 백업 파일 정리, 문서 상태 업데이트 ("설계 확정, 실행 대기" → "완료")

---

## 리스크 및 완화

| 리스크 | 완화 |
|---|---|
| term_dict 커버리지 부족 → `*_ko` 대량 NULL | LLM fallback 배치 + 수작업 검증 루프 |
| 검색 랭킹 튜닝 난이도 | RPC 내부 상수라 앱 재배포 없이 조정 가능. A/B 테스트 쿼리셋 준비 |
| 타입 의존 품종 필터 UX | `filter_wine_type` 변경 시 품종 선택 초기화 명시 |
| pgvector 비용/시간 | Phase 7로 분리, 필요성 검증 후 진행 |
| **와인나라·네이버 초기 수집 데이터 손실** | **legacy 3,493건 전수 역이관** (기준 충족 무관). 검증 쿼리로 orphan 0건 확인 |
| **wine21 raw_wines↔wines 연결 끊김** | name_ko 정확 매칭 32,776건(93.7%) UPDATE + 잔여 7,642건은 유사도 매칭 스크립트 |
| **wine_records FK 누수** | in-place ALTER로 wine_id 보존 — v2의 "rematch-fks.ts" 불필요 |
| **wine_records XOR 위반 7건** | Phase 2 CHECK 제약 추가 전에 `pending_wine_id = NULL` 업데이트 (wine_id 우선) |
| **기준 미달 DELETE로 wine_records UI 깨짐** | DELETE 전 `override_*` 필드로 값 복사. view의 COALESCE 체인이 UI 계속 정상 표시 |
| **평가 이관 누락** | Phase 4에서 이관 전후 건수 일치 확인. 이관 전 덤프 보관(Phase 0) |
| **구 컬럼 조기 DROP으로 롤백 불가** | wine_records 구 컬럼은 Phase 4에서 DROP하지 않고 Phase 8까지 보존 (1~2주 안정화 후) |
| **NOT NULL 제약 조기 적용 시 INSERT 실패** | NOT NULL/CHECK 제약은 Phase 3 기준 미달 DELETE **이후**에만 적용 (TX-8) |
| winery 고유명사 표시 애매 | 영문 유지. 추후 음차 사전 별도 구축 시 추가 |

---

## 향후 재검토 항목

1. **winery 한글 음차 사전** — 관례 정리되면 term_dict에 'winery' category 추가
2. **pending_wines 승격 자동화** — N명 이상 동일 입력 시 자동 승격 후보
3. **가격 필터 구체화** — wines에 현재 price 없음. wine_records 평균가? 크롤러 최저가? 결정 필요
4. **/find와 /dictionary 통합** — 사용자 피드백 보고 결정
5. **벡터 모델 교체 전략** — voyage 세대 바뀌면 전량 재임베딩 필요, 비용/운영 고려
6. **tasting_profile jsonb** — v2 보류 항목. 채택 시 구조 정의 및 LLM 추출 파이프라인
7. **materialized view 전환** — `wines_display`가 성능 병목 되면 전환

---

## 참고

- v2 원본: `docs/wines-redesign-plan.md`
- enrichment 배경: `docs/wine-db-enrichment-plan.md`
- 현재 검색 구현: `src/app/api/wines/search/route.ts`, `src/lib/wine-search.ts`
- 대상 UI: `src/app/(app)/wines/[id]/page.tsx`, `src/app/(app)/diary/[id]/DiaryDetail.tsx`

---

## 다음 세션 시작 체크리스트

- [ ] 이 문서 + v2 문서 읽기
- [ ] **"기존 데이터 영향 분석 및 보존 전략" 섹션 정독** — in-place ALTER + 전수 역이관 + 기준 미달 DELETE 전략의 근거
- [ ] baseline 재확인 (건수 변동 감지): `scripts/check-v3-baseline.ts`, `scripts/check-v3-migration-feasibility.ts`, `scripts/check-v3-required-fields.ts`
- [ ] enrichment 상태 최신화 (`scripts/check-vivino-status.ts`, `check-llm-status.ts`)
- [ ] `.env.local` 확인 (SUPABASE, Anthropic, Voyage — Phase 7)
- [ ] 리허설 환경 준비 (프로덕션 전용이므로 **별도 Supabase 프로젝트** 또는 **로컬 Supabase**로 dump/restore)
- [ ] 전체 Phase 리허설 완료 후 본 실행
