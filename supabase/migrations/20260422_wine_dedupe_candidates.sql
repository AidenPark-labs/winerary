-- 중복 매칭 검수 큐
--
-- 목적:
--   promote 파이프라인이 "같은 와인일 가능성이 있지만 자동 merge 임계값에는 미달"인
--   raw_wines/wines 쌍을 찾아서 이 테이블에 쌓는다. 어드민이 UI에서 한 건씩 확인하고
--   (a) 같은 와인 → raw_wines를 target wines로 merge (promoted_wine_id 연결)
--   (b) 다른 와인 → 반려. raw_wines는 별도 wines로 promote됨
--
-- 자동 merge 기준 (promote 스크립트에서):
--   normalize(name_en) + normalize(name_ko) + country 3개 전부 일치 → 바로 merge
--
-- 검수 큐 진입 기준:
--   - name_en 정규화가 같고 country 일치, 하지만 name_ko 정규화가 다름 (한글 음차 변형)
--   - name_ko 정규화가 같고 name_en 정규화가 다름
--   - Levenshtein 거리 기반 유사 매칭 (정규화 후 거리 ≤ 2)
--   - country mismatch (같은 와인이 다른 country로 분류된 경우 있음 — "France" vs "프랑스")

CREATE TABLE wine_dedupe_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 검수 대상
  raw_wine_id uuid NOT NULL REFERENCES raw_wines(id) ON DELETE CASCADE,
  target_wine_id uuid NOT NULL REFERENCES wines(id) ON DELETE CASCADE,

  -- 매칭 근거
  match_reason text NOT NULL,           -- 'name_ko_variant' | 'name_en_variant' | 'fuzzy_name' | 'country_mismatch'
  match_score numeric,                  -- 0.0 ~ 1.0 (유사도; 1.0에 가까울수록 동일)
  match_details jsonb,                  -- { normalized_keys, distances, ... } 디버깅용

  -- 검수 상태
  status text NOT NULL DEFAULT 'pending', -- 'pending' | 'confirmed' | 'rejected'
  reviewed_at timestamptz,
  reviewed_by uuid,
  reviewed_note text,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- 같은 페어가 중복 등록되지 않도록
  UNIQUE (raw_wine_id, target_wine_id)
);

CREATE INDEX wine_dedupe_candidates_pending_idx
  ON wine_dedupe_candidates (created_at)
  WHERE status = 'pending';

CREATE INDEX wine_dedupe_candidates_raw_idx
  ON wine_dedupe_candidates (raw_wine_id);

CREATE INDEX wine_dedupe_candidates_target_idx
  ON wine_dedupe_candidates (target_wine_id);

-- RLS: 어드민(service_role)만
ALTER TABLE wine_dedupe_candidates ENABLE ROW LEVEL SECURITY;
