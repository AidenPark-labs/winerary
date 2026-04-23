-- is_published 재도입 + RLS 정책 복구
--
-- 배경:
--   20260410_raw_wines_and_publish_gate.sql 에서 wines.is_published (boolean DEFAULT true) 컬럼 추가 +
--   RLS 정책 "wines: public read" USING (is_published = true) 생성.
--   그러나 DB 재설계 v3(2026-04-20) 과정에서 wines.is_published 컬럼이 migration 파일 없이 DROP됨.
--   결과적으로 노출 제어 메커니즘 자체가 사라짐 → 모든 와인이 anon에 전부 노출되는 상태.
--
-- 본 마이그레이션은 컬럼 + 인덱스 + 정책을 복구한다. 기본값 true이므로 기존 8,507건은 전부 공개 유지.
-- 추후 어드민이 필요 시 is_published=false 로 수동 숨김 가능 (hard delete 금지 원칙의 유일한 대체 수단).

-- 1) 컬럼 재도입 (이미 있으면 스킵)
ALTER TABLE wines ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true;

-- 2) 인덱스 복구 (파셜 인덱스: false 행만 따로 필터링하는 경우가 더 빈번)
CREATE INDEX IF NOT EXISTS wines_is_published_idx ON wines (is_published);

-- 3) 기존 정책 깨끗이 제거 후 재생성
DROP POLICY IF EXISTS "wines: public read" ON wines;

CREATE POLICY "wines: public read"
  ON wines FOR SELECT
  USING (is_published = true);

-- 4) RLS 활성화 (이미 활성이면 no-op)
ALTER TABLE wines ENABLE ROW LEVEL SECURITY;

-- 참고:
--   service_role 키는 RLS를 우회하므로 어드민 페이지/스크립트는 영향 없음.
--   anon + authenticated 는 is_published=true 행만 SELECT 가능.
--   UPDATE/INSERT/DELETE 는 기존 정책 유지 (service_role만 가능).
