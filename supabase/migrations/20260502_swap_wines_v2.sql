-- Phase 5: wines ↔ wines_v2 swap (단일 트랜잭션)
--
-- 흐름:
--   1. FK 7개 임시 제거 (RENAME 시 wines_old를 따라가지 않게)
--   2. wines_display view DROP (구 wines 컬럼 의존)
--   3. RENAME: wines → wines_old, wines_v2 → wines
--   4. FK 7개 재생성 (신 wines 가리키도록, ON DELETE 정책 동일)
--   5. RLS 정책 갱신 — service-only → public read (is_published=true)

BEGIN;

-- 1) FK 7개 임시 제거
ALTER TABLE public.wine_records DROP CONSTRAINT IF EXISTS wine_records_wine_id_fkey;
ALTER TABLE public.wine_wishlist DROP CONSTRAINT IF EXISTS wine_wishlist_wine_id_fkey;
ALTER TABLE public.pending_wines DROP CONSTRAINT IF EXISTS pending_wines_promoted_wine_id_fkey;
ALTER TABLE public.evaluations DROP CONSTRAINT IF EXISTS evaluations_wine_id_fkey;
ALTER TABLE public.wine_events DROP CONSTRAINT IF EXISTS wine_events_wine_id_fkey;
ALTER TABLE public.wine_reports DROP CONSTRAINT IF EXISTS wine_reports_wine_id_fkey;
ALTER TABLE public.wine_dedupe_candidates DROP CONSTRAINT IF EXISTS wine_dedupe_candidates_target_wine_id_fkey;

-- 2) wines_display view DROP (구 컬럼 의존; 추후 재생성)
DROP VIEW IF EXISTS public.wines_display CASCADE;

-- 3) RENAME
ALTER TABLE public.wines RENAME TO wines_old;
ALTER TABLE public.wines_v2 RENAME TO wines;

-- 4) FK 재생성 (신 wines 가리키도록)
ALTER TABLE public.wine_records
  ADD CONSTRAINT wine_records_wine_id_fkey
  FOREIGN KEY (wine_id) REFERENCES public.wines(id) ON DELETE SET NULL;

ALTER TABLE public.wine_wishlist
  ADD CONSTRAINT wine_wishlist_wine_id_fkey
  FOREIGN KEY (wine_id) REFERENCES public.wines(id) ON DELETE SET NULL;

ALTER TABLE public.pending_wines
  ADD CONSTRAINT pending_wines_promoted_wine_id_fkey
  FOREIGN KEY (promoted_wine_id) REFERENCES public.wines(id) ON DELETE NO ACTION;

ALTER TABLE public.evaluations
  ADD CONSTRAINT evaluations_wine_id_fkey
  FOREIGN KEY (wine_id) REFERENCES public.wines(id) ON DELETE SET NULL;

ALTER TABLE public.wine_events
  ADD CONSTRAINT wine_events_wine_id_fkey
  FOREIGN KEY (wine_id) REFERENCES public.wines(id) ON DELETE CASCADE;

ALTER TABLE public.wine_reports
  ADD CONSTRAINT wine_reports_wine_id_fkey
  FOREIGN KEY (wine_id) REFERENCES public.wines(id) ON DELETE CASCADE;

ALTER TABLE public.wine_dedupe_candidates
  ADD CONSTRAINT wine_dedupe_candidates_target_wine_id_fkey
  FOREIGN KEY (target_wine_id) REFERENCES public.wines(id) ON DELETE CASCADE;

-- 5) RLS 정책 — wines (신) 에 anon read 활성화
DROP POLICY IF EXISTS "wines_v2: service only" ON public.wines;
DROP POLICY IF EXISTS "wines: public read" ON public.wines;

CREATE POLICY "wines: public read"
  ON public.wines
  FOR SELECT
  TO public
  USING (is_published = true);

-- INSERT/UPDATE/DELETE는 service_role만 (RLS 우회)
-- 별도 정책 없음 = deny (단 service_role은 RLS 우회)

COMMIT;
