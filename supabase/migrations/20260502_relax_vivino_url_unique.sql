-- vivino_wines.vivino_url UNIQUE 제약 완화 + 검수 view
--
-- 배경:
--   build-wines-v2 backfill 사전 검증 결과 wines.vivino_url 중복 851개 그룹 발견.
--   같은 Vivino 와인을 가리키는 여러 wines (dedupe 안 된 상태).
--   wines_v2.id = wines.id 정책이라 wine_id PK는 중복 없지만, vivino_url은 중복 허용 필요.
--
-- 변경:
--   1. vivino_wines.vivino_url UNIQUE → 일반 INDEX (조회 성능 유지)
--   2. 검수용 view `vivino_url_duplicates` — 같은 vivino_url을 공유하는 wine_id 그룹 조회
--
-- 추후:
--   어드민이 view로 중복 그룹 식별 → wine_dedupe_candidates에 등록 → /admin/dedupe-review에서 처리

BEGIN;

-- 1) UNIQUE 제약 제거
ALTER TABLE public.vivino_wines DROP CONSTRAINT IF EXISTS vivino_wines_vivino_url_key;

-- 2) 일반 인덱스 추가 (조회용)
CREATE INDEX IF NOT EXISTS vivino_wines_vivino_url_idx
  ON public.vivino_wines (vivino_url);

-- 3) 검수용 view
CREATE OR REPLACE VIEW public.vivino_url_duplicates AS
SELECT
  vivino_url,
  COUNT(*) AS dup_count,
  array_agg(wine_id ORDER BY created_at) AS wine_ids,
  array_agg(vivino_name ORDER BY created_at) AS vivino_names,
  MIN(created_at) AS first_created_at,
  MAX(updated_at) AS last_updated_at
FROM public.vivino_wines
WHERE vivino_url IS NOT NULL
GROUP BY vivino_url
HAVING COUNT(*) > 1;

COMMENT ON VIEW public.vivino_url_duplicates IS
  '같은 vivino_url을 공유하는 wine_id 그룹 조회용. backfill 후 wines dedupe 후보 식별에 사용.';

COMMIT;
