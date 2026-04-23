-- Vivino 매칭 재검수 이력 추적용 타임스탬프
--
-- 목적:
--   - `vivino_needs_review`는 SALVAGED 최초 마킹용. 어드민이 검수를 마치면 false로 내려가지만
--     "누가 언제 검수했는지"가 남지 않아 재검수 루프가 불가능함.
--   - `vivino_reviewed_at`을 별도 기록하면:
--     (1) 전체 Vivino 매칭 건(PASS + SALVAGED 모두)을 재검수 대상으로 삼을 수 있고,
--     (2) "아직 한 번도 재검수 안 된 건 → 오래 전 검수된 건 → 최근 검수된 건" 순으로 큐 구성 가능.
--
-- 업데이트 규칙:
--   - confirmVivinoMatch: vivino_reviewed_at = now() + vivino_needs_review = false
--   - unlinkVivinoMatch: vivino_reviewed_at = now() + vivino_needs_review = false + 모든 vivino_* 초기화

ALTER TABLE wines ADD COLUMN vivino_reviewed_at timestamptz;

-- 전체 매칭 건에서 "재검수 우선순위" 정렬용 인덱스.
-- vivino_url이 있는 건만 대상이므로 partial index.
CREATE INDEX wines_vivino_reviewed_at_idx
  ON wines (vivino_reviewed_at NULLS FIRST, id)
  WHERE vivino_url IS NOT NULL;
