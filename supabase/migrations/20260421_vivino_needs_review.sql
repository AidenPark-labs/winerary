-- Vivino 매칭 3-way strict 검증 후 "구제" 판정된 와인을 어드민 재검수 대상으로 마킹하기 위한 플래그
--
-- 2026-04-21: KEEP 7,745에 3-way strict 검증 수행
--   - PASS (5,730): producer_en/brand/grape_varieties가 Vivino corpus와 100% 완전일치 → 고신뢰
--   - SALVAGED (1,802): raw.winery_en / bracket alt / name_prefix_adjacent 중 하나로 fallback 매칭 → 저신뢰, 재검수 필요
--   - FAIL (213): 삭제 대상
--
-- 이 컬럼은 SALVAGED 1,802건에 대해 true로 세팅. 어드민 wines 페이지에서 필터하여 수동 검수.

ALTER TABLE wines ADD COLUMN vivino_needs_review boolean NOT NULL DEFAULT false;

CREATE INDEX wines_needs_review_idx ON wines (vivino_needs_review) WHERE vivino_needs_review = true;
