-- wines + vivino_wines LEFT JOIN view (어드민 검색 필터용)
--
-- 배경:
--   /admin/wines의 Vivino 필터는 vivino_wines wine_id를 .in()으로 넘기는 방식이었음.
--   supabase-js 기본 limit 1000 + URL 길이 한계로 11,677건 중 1000건만 처리 → 0건 나옴.
--   view로 LEFT JOIN하면 한 쿼리로 필터 가능 (vivino_rating IS NOT NULL 등).
--
-- 정책:
--   - SECURITY INVOKER (호출자 권한 — RLS 따라감)
--   - service_role만 접근 (어드민 페이지 전용)

BEGIN;

CREATE OR REPLACE VIEW public.wines_with_vivino AS
SELECT
  w.*,
  v.vivino_url,
  v.vivino_wine_id,
  v.vivino_name,
  v.rating       AS vivino_rating,
  v.reviews      AS vivino_reviews,
  v.winery       AS vivino_winery,
  v.grapes       AS vivino_grapes,
  v.region       AS vivino_region,
  v.style        AS vivino_style,
  v.alcohol      AS vivino_alcohol,
  v.description  AS vivino_description,
  v.image_url    AS vivino_image_url,
  v.needs_review AS vivino_needs_review,
  v.reviewed_at  AS vivino_reviewed_at,
  v.match_score  AS vivino_match_score
FROM public.wines w
LEFT JOIN public.vivino_wines v ON v.wine_id = w.id;

COMMENT ON VIEW public.wines_with_vivino IS
  '어드민 검색 필터용. wines + vivino_wines LEFT JOIN. service_role 전용.';

COMMIT;
