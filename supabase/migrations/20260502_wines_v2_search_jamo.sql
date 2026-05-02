-- wines_v2.search_jamo 자동 빌드 트리거 + 기존 행 일괄 채우기
--
-- 한글 자모 분해 함수 hangul_to_jamo()는 이미 DB에 존재 (기존 wines 인프라).
-- wines_v2에도 동일 정책 적용: name_ko + name_en 기반 search_jamo 자동 갱신.

BEGIN;

CREATE OR REPLACE FUNCTION public.wines_v2_build_search_jamo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_jamo :=
    public.hangul_to_jamo(
      coalesce(NEW.name_ko, '') || ' ' || coalesce(NEW.name_en, '')
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wines_v2_search_jamo_trigger ON public.wines_v2;
CREATE TRIGGER wines_v2_search_jamo_trigger
  BEFORE INSERT OR UPDATE OF name_ko, name_en
  ON public.wines_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.wines_v2_build_search_jamo();

-- 기존 행 일괄 채우기 (트리거가 INSERT 시점에 적용되지만 backfill 시 UPDATE OF 트리거가 안 동작했음)
UPDATE public.wines_v2
SET search_jamo = public.hangul_to_jamo(
  coalesce(name_ko, '') || ' ' || coalesce(name_en, '')
)
WHERE search_jamo IS NULL;

COMMIT;
