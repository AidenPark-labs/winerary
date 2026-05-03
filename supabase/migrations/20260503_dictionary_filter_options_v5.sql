-- dictionary_filter_options RPC v5 — grape_varieties_ko → grape_varieties
--
-- swap 후 wines에는 grape_varieties_ko 없고 grape_varieties (한글 단일)만 존재.

BEGIN;

CREATE OR REPLACE FUNCTION public.dictionary_filter_options(filter_wine_type text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
  SELECT jsonb_build_object(
    'wine_types', (
      SELECT jsonb_agg(jsonb_build_object('value', wine_type, 'count', c))
      FROM (
        SELECT wine_type, count(*) AS c
        FROM wines
        WHERE wine_type IS NOT NULL AND is_published = true
        GROUP BY wine_type ORDER BY c DESC
      ) t
    ),
    'countries', (
      SELECT jsonb_agg(jsonb_build_object('value', country_ko, 'count', c))
      FROM (
        SELECT country_ko, count(*) AS c
        FROM wines
        WHERE country_ko IS NOT NULL
          AND is_published = true
          AND (filter_wine_type IS NULL OR wine_type = filter_wine_type)
        GROUP BY country_ko ORDER BY c DESC
      ) t
    ),
    'grapes', (
      SELECT jsonb_agg(jsonb_build_object('value', grape, 'count', c))
      FROM (
        SELECT grape, count(*) AS c
        FROM wines, unnest(grape_varieties) AS grape
        WHERE is_published = true
          AND (filter_wine_type IS NULL OR wine_type = filter_wine_type)
        GROUP BY grape
        ORDER BY c DESC
      ) t
    )
  );
$function$;

COMMIT;
