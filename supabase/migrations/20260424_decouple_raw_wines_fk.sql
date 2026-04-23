-- raw_wines.promoted_wine_id 의 FK 제약 제거
--
-- 배경:
--   초기 설계에서 raw_wines.promoted_wine_id 를 wines(id) REFERENCES + ON DELETE SET NULL 로 잡았음.
--   이는 "raw_wines가 wines의 백업/소스"라는 의도였으나, 실제 운영 중 wines를 어드민이 재편성할 때마다
--   raw_wines와 의도적 불일치가 생김 (예: URL 교체로 wines.vivino_*가 바뀌지만 raw_payload는 수집 당시).
--
-- 정책 재정립:
--   raw_wines = 수집 원본 소스 (append-only, 한 번 수집하면 건드리지 않음)
--   wines = 현재 서비스 상태 (어드민이 자유롭게 편집)
--   둘은 독립 레이어. "어떤 raw가 어떤 wines로 promote됐다"는 **기록**만 유지.
--
-- 변경:
--   FK 제약만 제거. 컬럼 자체는 유지 (중복 promote 방지용).
--   promoted_wine_id는 이제 단순 uuid 기록이며 wines 삭제와 무관.

ALTER TABLE raw_wines
  DROP CONSTRAINT IF EXISTS raw_wines_promoted_wine_id_fkey;

-- (참고) 인덱스는 컬럼 자체에 붙어있던 것이 유지됨. 필요 시 조회 성능 위해:
CREATE INDEX IF NOT EXISTS raw_wines_promoted_wine_id_idx
  ON raw_wines (promoted_wine_id)
  WHERE promoted_wine_id IS NOT NULL;
