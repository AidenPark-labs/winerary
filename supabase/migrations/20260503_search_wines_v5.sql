-- search_wines RPC v5 재작성
--
-- 배경:
--   swap 후 wines (구 wines_v2)에는 country/region_path/grape_varieties_ko/wine_style_ko/
--   vivino_rating/vivino_reviews/embedding 컬럼이 없거나 의미 변경됨.
--   기존 RPC가 이 컬럼들을 참조해 "column does not exist" 에러로 검색 전체 실패.
--
-- 변경:
--   - country_display = country_ko (단일)
--   - region_display = region_ko (단일)
--   - grape_varieties_display = grape_varieties (한글 단일)
--   - style_display = wine_style (영문 단일)
--   - vivino_rating/reviews는 vivino_wines LEFT JOIN (reviewed_at IS NOT NULL만)
--   - filter_grapes_ko 매칭 컬럼 grape_varieties (한글)
--   - embedding 컬럼은 NULL 가능성 높지만 코드 그대로 (q_embedding 인자 NULL이면 vec_sim 0)

BEGIN;

CREATE OR REPLACE FUNCTION public.search_wines(
  q text DEFAULT NULL,
  filter_wine_type text DEFAULT NULL,
  filter_country_ko text DEFAULT NULL,
  filter_grapes_ko text[] DEFAULT NULL,
  filter_price_min integer DEFAULT NULL,
  filter_price_max integer DEFAULT NULL,
  q_embedding vector DEFAULT NULL,
  k integer DEFAULT 20
)
RETURNS TABLE(
  id uuid,
  name_ko text,
  name_en text,
  country_display text,
  region_display text,
  grape_varieties_display text[],
  style_display text,
  wine_type text,
  image_url text,
  vivino_rating numeric,
  vivino_reviews integer,
  price integer,
  score real
)
LANGUAGE sql
STABLE
AS $function$
  WITH q_expanded AS (
    SELECT COALESCE(string_agg(DISTINCT x, ' OR '), q) AS q_text
    FROM (
      SELECT q AS x WHERE q IS NOT NULL
      UNION
      SELECT t.ko FROM term_dict t
      WHERE q IS NOT NULL AND (
        lower(trim(t.en)) = lower(trim(q))
        OR lower(trim(t.ko)) = lower(trim(q))
        OR EXISTS (SELECT 1 FROM unnest(t.aliases) a WHERE lower(trim(a)) = lower(trim(q)))
      )
      UNION
      SELECT t.en FROM term_dict t
      WHERE q IS NOT NULL AND (
        lower(trim(t.en)) = lower(trim(q))
        OR lower(trim(t.ko)) = lower(trim(q))
        OR EXISTS (SELECT 1 FROM unnest(t.aliases) a WHERE lower(trim(a)) = lower(trim(q)))
      )
    ) s
  ),
  q_tsquery AS (
    SELECT CASE
      WHEN q IS NULL OR length(q) < 2 THEN NULL
      ELSE websearch_to_tsquery('simple'::regconfig, (SELECT q_text FROM q_expanded))
    END AS tsq
  ),
  q_jamo_base AS (
    SELECT CASE
      WHEN q IS NULL OR length(q) < 2 THEN NULL
      ELSE REPLACE(hangul_to_jamo(q), ' ', '')
    END AS jq
  ),
  q_jamo_variants AS (
    SELECT DISTINCT x FROM (
      SELECT (SELECT jq FROM q_jamo_base) AS x
      UNION SELECT REPLACE((SELECT jq FROM q_jamo_base), 'ㅈ', 'ㅅ')
      UNION SELECT REPLACE((SELECT jq FROM q_jamo_base), 'ㅅ', 'ㅈ')
      UNION SELECT REPLACE((SELECT jq FROM q_jamo_base), 'ㅆ', 'ㅅ')
      UNION SELECT REPLACE((SELECT jq FROM q_jamo_base), 'ㅅ', 'ㅆ')
      UNION SELECT REPLACE((SELECT jq FROM q_jamo_base), 'ㄲ', 'ㅋ')
      UNION SELECT REPLACE((SELECT jq FROM q_jamo_base), 'ㅋ', 'ㄲ')
      UNION SELECT REPLACE((SELECT jq FROM q_jamo_base), 'ㄸ', 'ㅌ')
      UNION SELECT REPLACE((SELECT jq FROM q_jamo_base), 'ㅌ', 'ㄸ')
      UNION SELECT REPLACE((SELECT jq FROM q_jamo_base), 'ㅃ', 'ㅍ')
      UNION SELECT REPLACE((SELECT jq FROM q_jamo_base), 'ㅍ', 'ㅃ')
      UNION SELECT REPLACE((SELECT jq FROM q_jamo_base), 'ㅉ', 'ㅊ')
      UNION SELECT REPLACE((SELECT jq FROM q_jamo_base), 'ㅊ', 'ㅉ')
    ) v WHERE x IS NOT NULL
  ),
  scored AS (
    SELECT
      w.id, w.name_ko, w.name_en,
      w.country_ko AS country_display,
      w.region_ko  AS region_display,
      NULLIF(w.grape_varieties, '{}'::text[]) AS grape_varieties_display,
      w.wine_style AS style_display,
      w.wine_type, w.image_url,
      v.rating  AS vivino_rating,
      v.reviews AS vivino_reviews,
      w.price,
      CASE WHEN (SELECT tsq FROM q_tsquery) IS NOT NULL
        THEN ts_rank(w.search_tsv, (SELECT tsq FROM q_tsquery))
        ELSE 0 END AS ts_rank,
      CASE WHEN q IS NOT NULL
        THEN GREATEST(similarity(w.name_ko, q), similarity(coalesce(w.name_en,''), q))
        ELSE 0 END AS trgm_sim,
      CASE WHEN EXISTS (SELECT 1 FROM q_jamo_variants qv WHERE w.search_jamo ILIKE '%' || qv.x || '%')
           THEN 1.0 ELSE 0.0 END AS jamo_match,
      CASE WHEN q_embedding IS NOT NULL AND w.embedding IS NOT NULL
        THEN 1 - (w.embedding <=> q_embedding)
        ELSE 0 END AS vec_sim,
      LEAST(1.0, (coalesce(v.rating, 0) * ln(1 + coalesce(v.reviews, 0))) / 30.0) AS popularity
    FROM wines w
    LEFT JOIN vivino_wines v
      ON v.wine_id = w.id AND v.reviewed_at IS NOT NULL
    WHERE w.is_published = true
      AND (filter_wine_type   IS NULL OR w.wine_type = filter_wine_type)
      AND (filter_country_ko  IS NULL OR w.country_ko = filter_country_ko)
      AND (filter_grapes_ko   IS NULL OR w.grape_varieties && filter_grapes_ko)
      AND (filter_price_min   IS NULL OR w.price >= filter_price_min)
      AND (filter_price_max   IS NULL OR w.price <= filter_price_max)
      AND (
        q IS NULL
        OR (SELECT tsq FROM q_tsquery) IS NULL
        OR w.search_tsv @@ (SELECT tsq FROM q_tsquery)
        OR w.name_ko % q
        OR coalesce(w.name_en, '') % q
        OR EXISTS (SELECT 1 FROM q_jamo_variants qv WHERE w.search_jamo ILIKE '%' || qv.x || '%')
      )
  )
  SELECT
    s.id, s.name_ko, s.name_en,
    s.country_display, s.region_display,
    s.grape_varieties_display, s.style_display,
    s.wine_type, s.image_url,
    s.vivino_rating, s.vivino_reviews, s.price,
    (s.ts_rank * 2.0 + s.trgm_sim * 1.0 + s.jamo_match * 1.2 + s.vec_sim * 0.5 + s.popularity * 0.3)::real AS score
  FROM scored s
  WHERE q IS NULL OR s.ts_rank > 0.01 OR s.trgm_sim > 0.25 OR s.jamo_match > 0
  ORDER BY score DESC
  LIMIT k;
$function$;

COMMIT;
