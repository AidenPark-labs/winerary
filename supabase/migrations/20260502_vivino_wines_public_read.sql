-- vivino_wines RLS 정책 — anon SELECT 허용
--
-- 배경:
--   swap 후 wines는 anon read 정책 활성화됐지만 vivino_wines는 여전히 service-only.
--   유저 화면 (와인 상세의 Vivino 별점)·어드민 페이지 (anon supabase client 사용 시)에서 데이터 표시 안 됨.
--
-- 정책:
--   - reviewed_at IS NOT NULL인 행만 노출 (어드민 검수 완료한 매칭만 유저 노출)
--   - service_role은 RLS 우회 → 어드민 검수 페이지는 모든 행 보임

BEGIN;

DROP POLICY IF EXISTS "vivino_wines: service only" ON public.vivino_wines;
DROP POLICY IF EXISTS "vivino_wines: public read" ON public.vivino_wines;

CREATE POLICY "vivino_wines: public read"
  ON public.vivino_wines
  FOR SELECT
  TO public
  USING (reviewed_at IS NOT NULL);

-- INSERT/UPDATE/DELETE 정책 없음 → service_role만 가능

COMMIT;
