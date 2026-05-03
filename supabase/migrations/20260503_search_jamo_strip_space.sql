-- search_jamo 트리거 공백 제거 + 전수 backfill
--
-- 배경:
--   search_wines RPC는 q에서 공백을 REPLACE로 제거 후 search_jamo와 ILIKE 매칭.
--   v5 트리거는 'name_ko || " " || name_en' → hangul_to_jamo로 공백을 그대로 유지.
--   q ('무초마스') vs search_jamo ('ㅁㅜㅊㅗ ㅁㅏㅅㅡ ㄹㅔㄷㅡ') 비교 시 공백 위치
--   불일치로 ILIKE 매칭 실패 → 검색 0건.
--   기존 wines (swap 전)는 공백 없이 저장된 형태였음 (sanpedrosideral 같이).

BEGIN;

CREATE OR REPLACE FUNCTION public.wines_v2_build_search_jamo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_jamo := REPLACE(
    public.hangul_to_jamo(
      coalesce(NEW.name_ko, '') || ' ' || coalesce(NEW.name_en, '')
    ),
    ' ', ''
  );
  RETURN NEW;
END;
$$;

-- 기존 행 전수 backfill
UPDATE public.wines
SET search_jamo = REPLACE(
  public.hangul_to_jamo(coalesce(name_ko, '') || ' ' || coalesce(name_en, '')),
  ' ', ''
);

COMMIT;
