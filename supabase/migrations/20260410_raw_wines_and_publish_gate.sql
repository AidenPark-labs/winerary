-- raw_wines: 수집 staging 테이블 + wines.is_published 노출 게이트
--
-- 흐름:
--   1. collect-{gangnam,winenara,naver}.ts → raw_wines (일반 소스 컬럼 채움)
--   2. scrape-vivino-raw.ts → raw_wines (vivino_* 컬럼 채움)
--   3. promote-wines.ts → 양쪽 모두 채워진 raw 행을 wines로 upsert
--   4. wines.is_published=true (default) → RLS public read 통과
--   5. 사후 청소: 어드민이 is_published=false로 수동 숨김
--
-- service_role은 RLS 우회하므로 어드민 경로는 영향 없음.
-- anon 키 read는 자동으로 published만 받음.

-- ─── raw_wines staging 테이블 ─────────────────────────────────────────────

CREATE TABLE raw_wines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 일반 소스 식별
  source text NOT NULL,             -- 'gangnam' | 'winenara' | 'naver_shopping'
  source_id text NOT NULL,          -- branduid, product_cd 등 사이트 고유 ID
  collected_at timestamptz DEFAULT now(),

  -- 일반 소스 데이터 (수집 스크립트가 채움)
  name_ko text,
  name_en text,
  wine_type text,
  country text,
  region text,
  grape_variety text,
  producer text,
  description text,
  price integer,
  image_url text,
  alcohol text,
  raw_payload jsonb,

  -- vivino 보강 데이터 (scrape-vivino-raw.ts가 채움)
  vivino_url text,
  vivino_page_url text,
  vivino_wine_id text,
  vivino_rating numeric(2,1),
  vivino_reviews integer,
  vivino_winery text,
  vivino_grapes text,
  vivino_region text,
  vivino_style text,
  vivino_alcohol text,
  vivino_description text,
  vivino_allergens text,
  vivino_scraped_at timestamptz,        -- NULL이면 큐 (아직 시도 안 함)
  vivino_match_failed boolean DEFAULT false,

  -- 운영
  promoted_wine_id uuid REFERENCES wines(id) ON DELETE SET NULL,
  promoted_at timestamptz,
  rejected_reason text,                 -- 'garbage' | 'no_vivino_match' | etc.

  UNIQUE (source, source_id)
);

-- 큐/검색 인덱스
CREATE INDEX raw_wines_vivino_queue_idx
  ON raw_wines (collected_at)
  WHERE vivino_scraped_at IS NULL;

CREATE INDEX raw_wines_promote_queue_idx
  ON raw_wines (vivino_scraped_at)
  WHERE vivino_scraped_at IS NOT NULL
    AND vivino_match_failed = false
    AND promoted_wine_id IS NULL;

CREATE INDEX raw_wines_name_ko_idx ON raw_wines (name_ko);
CREATE INDEX raw_wines_source_idx ON raw_wines (source);

-- RLS: 어드민(service_role)만 접근. 일반 사용자는 raw_wines를 볼 일 없음.
ALTER TABLE raw_wines ENABLE ROW LEVEL SECURITY;
-- (정책 없음 = anon 접근 차단. service_role은 RLS 우회)


-- ─── wines.is_published 노출 게이트 ───────────────────────────────────────

ALTER TABLE wines ADD COLUMN is_published boolean NOT NULL DEFAULT true;

-- 기존 데이터 백필: vivino 매칭이 있는 와인만 노출
UPDATE wines
SET is_published = (vivino_url IS NOT NULL OR vivino_page_url IS NOT NULL);

CREATE INDEX wines_is_published_idx ON wines (is_published);


-- ─── RLS 정책 변경 ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "wines: public read" ON wines;
CREATE POLICY "wines: public read"
  ON wines FOR SELECT
  USING (is_published = true);
