# DB 전면 재설계 플랜 (v2)

> 작성일: 2026-04-11
> 목적: "와인 DB 우선" 철학으로 전체 DB 구조를 재설계. 와인 정체성은 카탈로그에만, 기록은 순수 경험, 평가는 독립 테이블로 분리.
> 상태: **설계 확정, 실행 대기 중**

---

## 철학: 와인 DB 우선

원래 프로젝트는 "사용자가 와인 정보를 직접 입력"하는 형태로 시작했고, 와인 DB는 나중에 prefill 보조 수단으로 붙었다. 이제 철학을 뒤집는다:

> **와인 DB가 먼저다. 기록은 DB에 매칭된 와인을 참조하거나, 매칭되지 않은 경우에만 사용자가 직접 입력(pending)한다. 어느 쪽이든 기록 자체에는 와인 정체성 정보를 중복 저장하지 않는다.**

## 저작권/저장 원칙

이번 세션에서 확립된 원칙. enrichment·UI·외부 소스 활용 시 모두 적용:

| 카테고리 | 저장 가능 | 비고 |
|---|---|---|
| 사실 데이터 (wine_type, country, grape, alcohol, rating, count 등) | ✅ | |
| 단순 포인터(URL) | ✅ | vivino_url, naver_link 등 |
| 창작물 텍스트 (description, tasting note) | ❌ | Naver/Vivino 모두 직접 저장 불가 |
| 워터마크 이미지 | ❌ | Naver 백과사전 thumbnail 등 |
| 타사 호스팅 이미지 | ⚠️ | 링크만, 자체 호스팅 회피 |

→ 시음 노트류는 외부 링크로 사용자가 직접 확인. 자체 description 생성은 후속 LLM 합성 단계(별도 검토 중)에서만.

---

## 설계 원칙

1. **와인은 카탈로그, 기록은 경험** — 정체성 속성(이름, 생산자, 품종 등)은 기록에 절대 중복 저장하지 않음
2. **매칭된 와인은 참조만, 비매칭은 pending** — `wines`와 `pending_wines`가 동일한 정체성 스키마라 앱 레이어에서 구분 불필요
3. **직접 수정, 단일 레이어** — 어드민 편집은 컬럼 직접 UPDATE, 3중 cascade(`base`/`vivino_*`/`final_*`) 폐지
4. **평가는 독립 엔티티** — 기록에 평가 필드를 두지 않고 `evaluations` 테이블로 분리
5. **크롤링 소스는 staging에서 끝** — 앱 런타임은 canonical 테이블만 바라봄
6. **세션 기능 드롭** — 현재 접근 경로 없는 데드코드

---

## 확정된 결정 사항 (10개)

| # | 결정 | 비고 |
|---|---|---|
| 1 | 현 레포에서 리팩터 진행 (A안) | 새 레포 v2 아님 |
| 2 | 세션 기능 드롭 | 테이블 + 코드 전부 |
| 3 | wines 직접 수정, `source_snapshot` 백업, `locked_fields` 크롤러 보호 | JSONB overrides 아님 |
| 4 | `image_url text` 단일 nullable | 워터마크 없는 이미지만 사용 |
| 5 | `vintage`는 wine_records에만 | 카탈로그 폭발 방지 |
| 6 | `alcohol numeric(4,1)` nullable | |
| 7 | pending 승격은 어드민 수동 | 정기 재검토 필요 |
| 8 | 평가 이력 없음(UPDATE), `wine_id` denormalize | 집계 쿼리 효율화 |
| 9 | owner 평가는 조건부 INSERT | 점수 있으면 같이 생성 |
| 10 | `wine_wishlist`도 `wine_id` XOR `pending_wine_id` | wine_records와 구조 통일 |
| 11 | wines 수정은 과거 기록 반영, 스냅샷 없음 | |
| 12 | `wine_records_enriched` view 도입 | 앱 코드 단순화 |
| 13 | `wine_records`에 개별 `override_*` 컬럼 도입 | 매칭된 와인의 누락 필드를 기록 단위로 보완 |

---

## 엔티티 구조

```
[Staging]          raw_wines (wine21, legacy, 향후 다른 소스)
                        ↓ promote 스크립트
[Canonical]        wines  ←──┐
                             │ wine_id (FK)
[User-submitted]   pending_wines (wines와 동일 정체성 필드)
                             │ pending_wine_id (FK)
[Experience]       wine_records ──→ evaluations (role: owner|guest)
                        │              ↑
                        │              │ (wine_id denormalized)
                        ├─→ record_mentions
                        └─→ shared_experience_records

[View]             wine_records_enriched (records + wines/pending + owner eval)
```

---

## 전체 스키마

### 1. `wines` (canonical 와인 카탈로그)

```sql
CREATE TABLE wines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 정체성
  name_ko       text NOT NULL,
  name_en       text,
  producer_ko   text,
  producer_en   text,

  -- 분류 (단일 레이어)
  wine_type     text CHECK (wine_type IN ('red','white','rose','sparkling','fortified','dessert','other')),
  country       text,
  region        text,              -- "France / Bourgogne / Côte de Beaune"
  grape_variety text,              -- "Pinot Noir, Chardonnay"
  alcohol       numeric(4,1),

  -- 메타
  description   text,
  image_url     text,              -- 대부분 NULL, 워터마크 없는 이미지만

  -- 외부 링크 (사용자가 외부에서 시음 노트/평점 확인)
  vivino_url           text,
  vivino_wine_id       text,
  vivino_rating        numeric(2,1),
  vivino_ratings_count integer,
  naver_link           text,            -- 네이버 백과사전 entry URL

  -- 시음 프로필 (보류 — Track D 옵션 B 채택 시 활성화)
  -- tasting_profile jsonb,
  -- { color, aromas[], palate[], body, sweetness, acidity, tannin, finish }

  -- 수정 보호
  source_snapshot jsonb,           -- 최초 import/크롤 시점 원본 (감사/복원용)
  locked_fields   text[] DEFAULT '{}',  -- 어드민이 수정한 필드, 크롤러가 덮어쓰지 않음

  -- 소스 추적
  source       text NOT NULL CHECK (source IN ('wine21','legacy','manual','promoted')),
  source_refs  jsonb DEFAULT '{}', -- { wine21: "181028", vivino: "12345" }

  is_published boolean NOT NULL DEFAULT false,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX wines_name_ko_trgm ON wines USING gin (name_ko gin_trgm_ops);
CREATE INDEX wines_name_en_trgm ON wines USING gin (name_en gin_trgm_ops);
CREATE INDEX wines_published ON wines (is_published) WHERE is_published;
CREATE INDEX wines_source ON wines (source);
```

**드롭되는 기존 필드**: `base_*`, `final_*`, `vivino_description`, `vivino_grapes` 등 vivino 중복 필드, `naver_link`, `naver_image`, `gangnam_alcohol`, `data_source`.

---

### 2. `pending_wines` (사용자 투입 + 승격 대기)

`wines`와 **동일한 정체성 필드 세트**.

```sql
CREATE TABLE pending_wines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- wines와 동일한 정체성 필드
  name_ko       text NOT NULL,
  name_en       text,
  producer_ko   text,
  producer_en   text,
  wine_type     text,
  country       text,
  region        text,
  grape_variety text,
  alcohol       numeric(4,1),
  description   text,
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

CREATE INDEX pending_wines_status ON pending_wines (status);
CREATE INDEX pending_wines_submitted_by ON pending_wines (submitted_by);
```

**승격 쿼리**: `INSERT INTO wines (...) SELECT ... FROM pending_wines WHERE id = ?`. 승격 후 해당 pending의 `promoted_wine_id` 세팅, 이를 참조하던 `wine_records.pending_wine_id`는 트리거 또는 배치 스크립트로 `wine_id`로 재매핑.

---

### 3. `wine_records` (순수 경험)

```sql
CREATE TABLE wine_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,

  -- 와인 참조 (정확히 하나)
  wine_id         uuid REFERENCES wines(id) ON DELETE SET NULL,
  pending_wine_id uuid REFERENCES pending_wines(id) ON DELETE SET NULL,
  CHECK ((wine_id IS NULL) <> (pending_wine_id IS NULL) OR deleted_at IS NOT NULL),

  -- 경험 고유 정보
  vintage    integer,              -- 빈티지는 경험 단위
  drunk_at   date DEFAULT current_date,
  place_name text,
  latitude   numeric,
  longitude  numeric,
  companions text[],               -- @mention 문자열 배열
  photos     text[] DEFAULT '{}',  -- Supabase Storage URL
  foods      jsonb DEFAULT '[]',   -- [{name, note?}]
  tags       text[] DEFAULT '{}',

  -- 가격 (경험 시점)
  price      integer,
  price_type text CHECK (price_type IN ('market','retail')),
  price_unit text CHECK (price_unit IN ('bottle','glass')),

  -- 카탈로그 누락 필드 오버라이드 (해당 기록에만 적용)
  -- wines 또는 pending_wines의 해당 필드가 NULL이거나 사용자가 수정하고 싶을 때 사용
  -- view에서 COALESCE(r.override_X, w.X, p.X)로 병합
  override_wine_type     text CHECK (override_wine_type IN ('red','white','rose','sparkling','fortified','dessert','other')),
  override_country       text,
  override_region        text,
  override_grape_variety text,
  override_alcohol       numeric(4,1),

  -- 공유
  visibility  text DEFAULT 'private' CHECK (visibility IN ('private','link','public')),
  invite_code text UNIQUE,

  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX wine_records_user ON wine_records (user_id) WHERE deleted_at IS NULL;
CREATE INDEX wine_records_wine ON wine_records (wine_id) WHERE deleted_at IS NULL;
CREATE INDEX wine_records_pending ON wine_records (pending_wine_id) WHERE deleted_at IS NULL;
CREATE INDEX wine_records_visibility ON wine_records (visibility) WHERE visibility = 'public' AND deleted_at IS NULL;
```

**드롭되는 기존 필드**: `name`, `wine_name_original`, `wine_type`, `wine_country`, `grape_variety`, `wine_vivino_url` (와인 정체성 → wines에서 JOIN), `rating`, `value_score`, `pairing_score`, `memo`, `repurchase_intent` (→ evaluations로 이동), `location` (→ place_name으로 일원화).

---

### 4. `evaluations` (새 테이블 — 평가 독립)

```sql
CREATE TABLE evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 대상 기록
  record_id uuid REFERENCES wine_records(id) ON DELETE CASCADE NOT NULL,

  -- 와인 (denormalized — record와 동일한 값, INSERT 시 복사)
  wine_id         uuid REFERENCES wines(id) ON DELETE SET NULL,
  pending_wine_id uuid REFERENCES pending_wines(id) ON DELETE SET NULL,
  CHECK ((wine_id IS NULL) <> (pending_wine_id IS NULL)),

  -- 평가자
  user_id  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  nickname text,                   -- 비로그인 게스트용
  role     text NOT NULL CHECK (role IN ('owner','guest')),

  -- 점수 (모두 선택적)
  rating            numeric(3,1) CHECK (rating BETWEEN 0 AND 5),
  value_score       numeric(3,1) CHECK (value_score BETWEEN 0 AND 5),
  pairing_score     integer CHECK (pairing_score BETWEEN 1 AND 5),
  repurchase_intent text CHECK (repurchase_intent IN ('yes','maybe','no')),
  memo              text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE (record_id, user_id)      -- 재평가는 UPDATE로 덮어씀
);

CREATE INDEX evaluations_user_wine ON evaluations (user_id, wine_id);
CREATE INDEX evaluations_wine ON evaluations (wine_id);
CREATE INDEX evaluations_record ON evaluations (record_id);
CREATE UNIQUE INDEX evaluations_owner_single
  ON evaluations (record_id) WHERE role = 'owner';
```

**`wine_id` denormalize 이유**: "이 와인에 대한 내 평가 전체", "이 와인의 평균 평점" 같은 집계 쿼리를 `wine_records` JOIN 없이 수행하기 위함. 일관성은 앱 레이어 INSERT 시 record에서 복사로 보장 (record의 wine_id는 불변).

**owner/guest 정책**:
- owner: record당 **정확히 하나** (partial unique index)
- guest: record당 여러 명 가능, user당 하나 (UNIQUE)
- 익명 게스트: `user_id NULL + nickname`, 중복 허용 (Postgres UNIQUE가 NULL 중복 허용)

**기존 `record_evaluations` 테이블은 이 테이블로 이관 후 드롭**.

---

### 5. `wine_wishlist` (재구성)

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

CREATE INDEX wine_wishlist_user ON wine_wishlist (user_id);
```

**드롭되는 기존 필드**: `name_ko`, `name_en` (→ wines/pending_wines에서 JOIN).

---

### 6. `wine_records_enriched` (view)

```sql
CREATE VIEW wine_records_enriched AS
SELECT
  r.*,
  -- 와인 정체성 (wines 또는 pending_wines에서 가져옴, 오버라이드 없음)
  COALESCE(w.name_ko, p.name_ko)               AS wine_name_ko,
  COALESCE(w.name_en, p.name_en)               AS wine_name_en,
  COALESCE(w.producer_ko, p.producer_ko)       AS producer_ko,
  COALESCE(w.producer_en, p.producer_en)       AS producer_en,
  -- 오버라이드 가능 필드: 기록 오버라이드 → wines → pending_wines
  COALESCE(r.override_wine_type, w.wine_type, p.wine_type)          AS wine_type,
  COALESCE(r.override_country, w.country, p.country)                AS country,
  COALESCE(r.override_region, w.region, p.region)                   AS region,
  COALESCE(r.override_grape_variety, w.grape_variety, p.grape_variety) AS grape_variety,
  COALESCE(r.override_alcohol, w.alcohol, p.alcohol)                AS alcohol,
  COALESCE(w.image_url, p.image_url)           AS image_url,
  (w.id IS NOT NULL)                           AS is_catalog_wine,
  -- owner 평가 (1:1)
  oe.rating,
  oe.value_score,
  oe.pairing_score,
  oe.repurchase_intent,
  oe.memo AS evaluation_memo
FROM wine_records r
LEFT JOIN wines w          ON r.wine_id = w.id
LEFT JOIN pending_wines p  ON r.pending_wine_id = p.id
LEFT JOIN evaluations oe   ON oe.record_id = r.id AND oe.role = 'owner';
```

**앱 사용**: 기록 목록/상세 조회는 이 view 대상으로 SELECT. INSERT/UPDATE는 base table(`wine_records`, `evaluations`) 대상. RLS는 base table 정책 적용.

---

### 7. `raw_wines` (staging, 앱 미참조)

**이미 존재**. 유지하되 역할 명확히:
- 크롤러만 쓴다 (wine21, 향후 다른 소스)
- promote 스크립트에서만 `wines`로 승격
- 앱 런타임 코드는 **절대 참조하지 않음**
- 승격 후 `promoted_wine_id` 연결, `source_refs` 백포인터 유지

---

## 유지되는 테이블 (변경 없음)

- `profiles`
- `record_mentions`
- `shared_experiences`, `shared_experience_records`
- `sommelier_chat` (관련 테이블)
- `push_tokens`

---

## 드롭 대상

### 테이블
- `sessions`
- `session_evaluations`
- `session_comments`
- `record_evaluations` (→ `evaluations`로 이관 후 드롭)

### 컬럼 (wines)
- `base_*` 전부
- `final_*` 8개
- `vivino_description`, `vivino_grapes` 등 canonical에 흡수된 것
- `naver_link`, `naver_image`
- `gangnam_alcohol`
- `data_source`

### 컬럼 (wine_records)
- `name`, `wine_name_original`
- `wine_type`, `wine_country`, `grape_variety`, `wine_vivino_url`
- `rating`, `value_score`, `pairing_score`, `memo`, `repurchase_intent` (→ evaluations)
- `location` (→ `place_name`으로 일원화)

### 컬럼 (wine_wishlist)
- `name_ko`, `name_en`

### 코드/파일
- `src/app/(app)/session/new/page.tsx`
- `src/app/session/[code]/page.tsx`, `SessionClient.tsx`
- `src/lib/actions/session.ts`
- `src/lib/wine-display.ts`의 3중 cascade 로직 (view로 대체)

---

## 실행 플랜

### Phase 1: 준비 (세션 내 완료)

1. **백업**
   - `wines`, `wine_records`, `wine_wishlist`, `pending_wines`, `record_evaluations`, `wine_records.photos`(메타) 전체 JSON 덤프
   - 파일: `/tmp/winerary-backup-YYYYMMDD/*.json`
2. **세션 기능 드롭**
   - 테이블 3개 DROP
   - 코드/파일 제거
3. **legacy wines → raw_wines 이관**
   - 기존 3,493건을 `raw_wines` (source='legacy', source_id=old_id)로 복사
   - raw_payload에 원본 전체 저장

### Phase 2: Vivino 풀 파이프라인 (백그라운드 5~10시간)

4. **`scripts/scrape-vivino-raw.ts` 작성**
   - `raw_wines` 대상 (source IN ('wine21', 'legacy'))
   - PoC 검증 로직 통합 (producer 매칭 + LLM 판정)
   - 병렬화 동시 4개 브라우저
   - 체크포인트 100건마다 저장, 재개 지원
   - 재시도 각 와인 최대 2회
5. **야간 실행** (예상 8~12시간)
6. **결과 검증**: 성공률, 매칭 품질 샘플 확인

### Phase 3: 스키마 재구성 (세션 내 완료)

7. **새 마이그레이션 SQL 작성**
   - DROP TABLE `sessions`, `session_evaluations`, `session_comments`
   - DROP TABLE `wines` (CASCADE)
   - CREATE TABLE `wines` (새 스키마)
   - ALTER TABLE `pending_wines` (정체성 필드 확장, `producer` → `producer_ko/en` split)
   - ALTER TABLE `wine_records` (드롭 컬럼 제거, `vintage` 유지, CHECK 제약 추가)
   - CREATE TABLE `evaluations`
   - ALTER TABLE `wine_wishlist` (드롭 컬럼 제거, FK 추가)
   - CREATE VIEW `wine_records_enriched`
8. **`scripts/promote-wines.ts` 작성**
   - raw_wines에서 canonical 필드 조합 → wines INSERT
   - Vivino 검증 통과 → `is_published=true`
   - 검증 실패 → `is_published=false`
9. **`scripts/migrate-evaluations.ts` 작성**
   - 기존 `wine_records.rating/value_score/pairing_score/memo/repurchase_intent` → `evaluations (role='owner')`
   - 기존 `record_evaluations` → `evaluations (role='guest')`
   - DROP `record_evaluations`

### Phase 4: FK 재매칭 (세션 내 완료)

10. **`scripts/rematch-fks.ts` 작성**
    - wine_records, wine_wishlist의 기존 이름 정보로 새 wines.id 찾기
    - 매칭 성공 → `wine_id` UPDATE
    - 매칭 실패 → `pending_wines`에 INSERT 후 `pending_wine_id` UPDATE
    - evaluations의 wine_id/pending_wine_id도 동시 재매핑
11. **결과 검증**
    - 31건 재매칭 성공률
    - wine_records 표시 정상 동작

### Phase 5: 코드 적응 (세션 내 완료)

12. **`src/lib/wine-display.ts` 제거 또는 대폭 축소**
    - 3단 cascade 로직 전부 제거
    - view 기반 단순 매핑만 남김
13. **`src/app/admin/wines/WinesClient.tsx` 수정**
    - `final_*` 편집 UI → 직접 수정 UI
    - `locked_fields` 토글 추가
14. **`src/app/wines/[id]/page.tsx` 수정**
    - view 기반 쿼리
15. **`src/app/(app)/diary/**` 수정**
    - 와인 선택 시 wine_id 세팅만, 정체성 필드 복사 제거
    - owner evaluation 분리 INSERT
16. **`src/app/(app)/find/**` 수정**
    - 와인 상세 조회를 view 기반으로
17. **타입 정의 갱신** (`src/types/`)
    - `WineRecord`에서 와인 정체성 필드 제거
    - `Evaluation` 타입 신규
    - `WineRecordEnriched` 타입 신규 (view용)
18. **기타 컬럼 참조 수정**
    - grep으로 `final_`, `vivino_description`, `wine_name_original`, `naver_image` 등 전부 찾아 수정
19. **빌드 테스트** (`npx next build`)

### Phase 6: 수동 검증 및 정리

20. **수동 테스트 체크리스트** (`docs/manual-test.md` 작성)
    - 와인 기록 작성 (매칭 + pending)
    - 사진 검색 → 기록
    - 평가 추가/수정
    - 와인 상세 조회
    - 어드민 편집
    - 찜 추가/삭제
    - 공유 링크
    - 푸시 알림
21. **백업 파일 정리**
22. **레거시 마이그레이션 파일 검토** (deprecate 또는 archive)

---

## 리스크 및 완화

| 리스크 | 완화 |
|---|---|
| Vivino 크롤 중간 실패 | 체크포인트 + 재개, 병렬 수 낮춤 |
| LLM 오판정 (false positive) | PoC에서 72% 확인됨, 수동 스팟체크 |
| 코드 컬럼 참조 놓침 | grep 전체 검색, 빌드 에러로 포착 |
| FK 재매칭 실패 | `pending_wines`로 이동, 이름 기반 표시 유지 |
| 마이그레이션 후 복구 | Phase 1 백업 → 필요 시 수동 복구 |
| view 성능 이슈 | materialized view로 전환 가능 |
| pending 품질 오염 | 초기엔 어드민 수동, 정기 재검토 |

---

## 향후 재검토 필요 항목

1. **pending_wines 승격 전략** — 입력 정규화, 퍼지 매칭, AI 중복 탐지, 어드민 병합 도구
2. **wine_vintages 서브테이블** — 빈티지별 차이가 핵심이 되면 도입 (현재는 wine_records.vintage만)
3. **evaluations 이력화** — 재평가 변화 추적이 필요해지면 UNIQUE 제거 + `superseded_at` 전환
4. **이미지 다소스 지원** — `image_url text` → `images jsonb` 전환 (저작권 클리어된 소스 확보 시)
5. **카탈로그 이미지 fallback** — view에 `wine_records.photos` 기반 파생 이미지 추가 (어드민 이미지 없을 때)
6. **오버라이드 → 카탈로그 promotion** — 어드민 대시보드에서 "N명 이상이 동일하게 입력한 override 값"을 집계하여 wines로 자동/수동 승격
7. **tasting_profile jsonb 도입 (옵션 B)** — Naver/Vivino description을 LLM으로 구조화 추출. `{ color, aromas[], palate[], body, sweetness, acidity, tannin, finish }`. 채택 결정 보류 중. 채택 시 `wine-db-enrichment-plan.md`의 Track D 실행.
8. **와인명 구조 분리 (winery / brand / varietal)** — 사용자 인식과 검색 정확도를 위해 와인명을 구성 요소로 분리. LLM 일괄 분석 필요. 현재는 단일 `name_ko` 머지 형태 유지.

---

## 참고 스크립트 (이미 작성됨)

| 파일 | 역할 |
|---|---|
| `scripts/collect-wine21.ts` | wine21 수집 (**완료, 재실행 불필요**) |
| `scripts/analyze-wine21-overlap.ts` | wine21 ↔ 기존 wines 겹침 분석 |
| `scripts/test-vivino-wine21.ts` | Vivino 보강 PoC (50건 검증용) |
| `scripts/validate-vivino-poc.ts` | PoC 결과 교차검증 + LLM 판정 |
| `scripts/fix-wine21-producer-en.ts` | producer_en 콤마 suffix 정제 (**완료**) |
| `src/lib/vivino-crawler.ts` | 기존 Vivino 크롤러 (재사용 대상) |

---

## 다음 세션 시작 체크리스트

- [ ] 이 문서 + `wine-db-enrichment-plan.md` 읽기
- [ ] `raw_wines` 현황 확인 (wine21 33,722건 그대로 있는지)
- [ ] `wines` 현황 확인 (legacy + wine21 promote 합 약 36,000건)
- [ ] `.env.local` 확인 (SUPABASE, NAVER, Anthropic)
- [ ] **enrichment 우선** — `wine-db-enrichment-plan.md`의 Track A → C → B 순서 진행
- [ ] enrichment 성공 기준 충족 후 → 본 문서 Phase 1 백업으로 이동

## 선행 조건

이 마이그레이션은 `wine-db-enrichment-plan.md`의 enrichment 작업이 **선행**되어야 한다.
재설계 스키마는 wines가 wine_type/country/region/grape 등 사실 데이터를 보유한다는 전제이며, 현재는 32,917건이 이름만 채워진 상태(2026-04-12 promote 결과)다.
