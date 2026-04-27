-- wines.vivino_page_url 컬럼 제거 (canonical = vivino_url로 통합)
--
-- 배경:
--   v3 redesign 계획(docs/wines-redesign-plan-v3.md:159)에 적힌 통합을 마무리.
--   현재 실측 vivino_url과 vivino_page_url은 12,142건 모두 동일 값. 통합 시 손실 없음.
--   /search/wines?q= 패턴 465건은 본 마이그레이션 적용 전에 vivino_* 일괄 NULL 처리됨
--   (scripts/null-search-vivino-urls.ts, 백업 vivino-search-url-backup-*.json).
--
-- 의존성 (scripts/check-wines-display-deps.ts 결과):
--   - wines_display view가 vivino_page_url을 SELECT 함 → view를 재정의하여 컬럼 제거.
--   - wines_display를 참조하는 다른 view/function: 0건.
--   - 본 마이그레이션은 view DROP & 재생성 + 컬럼 DROP을 한 트랜잭션으로 묶음.
--
-- 인덱스:
--   wines_vivino_reviewed_at_idx 는 `WHERE vivino_url IS NOT NULL` 조건이라 영향 없음.
--
-- 안전장치:
--   드롭 직전 두 컬럼 NOT NULL 행이 모두 동일 값인지 확인.
--   raw_wines.vivino_page_url 은 staging 테이블 자체 컬럼으로 별도 유지됨.

BEGIN;

-- 1) 두 컬럼이 다른 값인 행이 없는지 검증
DO $$
DECLARE
  divergent_count integer;
BEGIN
  SELECT count(*)
  INTO divergent_count
  FROM wines
  WHERE vivino_url IS DISTINCT FROM vivino_page_url
    AND (vivino_url IS NOT NULL OR vivino_page_url IS NOT NULL);

  IF divergent_count > 0 THEN
    RAISE EXCEPTION 'wines.vivino_url != wines.vivino_page_url 인 행 % 건 발견. 마이그레이션 중단.', divergent_count;
  END IF;
END $$;

-- 2) wines_display view 재정의 (vivino_page_url 컬럼만 제외, 나머지는 기존과 동일)
DROP VIEW IF EXISTS public.wines_display;

CREATE VIEW public.wines_display AS
SELECT
  id,
  name_ko,
  name_en,
  producer_ko,
  producer_en,
  wine_type,
  COALESCE(country_ko, country) AS country_display,
  COALESCE(region_ko, region_path) AS region_display,
  COALESCE(NULLIF(grape_varieties_ko, '{}'::text[]), NULLIF(grape_varieties, '{}'::text[])) AS grape_varieties_display,
  COALESCE(wine_style_ko, wine_style) AS style_display,
  image_url,
  vivino_url,
  vivino_rating,
  vivino_reviews,
  naver_link,
  country,
  region_path,
  grape_varieties,
  wine_style,
  source,
  source_refs,
  created_at,
  updated_at
FROM wines w;

-- 3) 컬럼 드롭
ALTER TABLE wines DROP COLUMN vivino_page_url;

COMMIT;
