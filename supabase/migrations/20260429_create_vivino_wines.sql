-- vivino_wines 신설 (Vivino 크롤링 데이터 분리 테이블)
--
-- 배경:
--   기존 wines.vivino_* 14개 컬럼을 별도 테이블로 분리.
--   v5 전략 (docs/wines-schema-simplification.md §3.2):
--     - wines 1 : 0..1 vivino_wines (wine_id PK)
--     - FK 없음 (raw_wines.promoted_wine_id 원칙과 동일, 독립 레이어)
--     - 유저 노출 조건은 reviewed_at IS NOT NULL일 때만
--     - URL 검증: 변환 모듈이 vivino.com 도메인 + 빈 값 체크
--     - rating·reviews·match_score CHECK 제약
--
-- 백필 대상:
--   wines.vivino_url IS NOT NULL 약 11,677건. wine_id = wines.id 그대로.
--   build-wines-v2.ts (Phase 1)에서 wines_v2 backfill과 함께 일괄 INSERT.

BEGIN;

CREATE TABLE IF NOT EXISTS public.vivino_wines (
  -- 식별: wine_id 자체가 PK (wines_v2와 1:1, FK 없음)
  wine_id         uuid PRIMARY KEY,

  -- Vivino 식별
  vivino_url      text NOT NULL UNIQUE,
  vivino_wine_id  text,
  vivino_name     text,

  -- 메트릭
  rating          numeric(2,1),
  reviews         integer,

  -- 상세 (Vivino 원본, 영문 그대로)
  winery          text,
  grapes          text,
  region          text,
  style           text,
  alcohol         text,
  description     text,
  allergens       text,
  image_url       text,

  -- 검수
  needs_review    boolean NOT NULL DEFAULT false,
  reviewed_at     timestamptz,
  match_score     numeric,

  -- 운영
  scraped_at      timestamptz,
  raw_payload     jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- 제약
  CONSTRAINT vivino_wines_rating_range
    CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
  CONSTRAINT vivino_wines_reviews_nonneg
    CHECK (reviews IS NULL OR reviews >= 0),
  CONSTRAINT vivino_wines_match_score_range
    CHECK (match_score IS NULL OR (match_score >= 0 AND match_score <= 1))
);

-- 인덱스 (wine_id는 PK라 자동)
CREATE INDEX IF NOT EXISTS vivino_wines_needs_review_idx
  ON public.vivino_wines (needs_review)
  WHERE needs_review = true;

CREATE INDEX IF NOT EXISTS vivino_wines_reviewed_at_idx
  ON public.vivino_wines (reviewed_at)
  WHERE reviewed_at IS NOT NULL;

-- updated_at 자동 갱신 (set_updated_at 함수는 wines_v2 마이그레이션에서 정의)
DROP TRIGGER IF EXISTS vivino_wines_set_updated_at ON public.vivino_wines;
CREATE TRIGGER vivino_wines_set_updated_at
  BEFORE UPDATE ON public.vivino_wines
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- RLS: service_role 전용
ALTER TABLE public.vivino_wines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vivino_wines: service only" ON public.vivino_wines;
CREATE POLICY "vivino_wines: service only"
  ON public.vivino_wines
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

-- 단, 유저 서빙 시점에 anon이 직접 vivino_wines를 조회할 가능성 있음
-- (vivino-rating API 등). swap 시점 또는 그 이전에 anon SELECT 정책 추가 필요.
-- 본 마이그레이션은 보수적으로 service_role 전용으로 시작.

COMMIT;
