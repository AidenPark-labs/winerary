-- ============================================================
-- Winerary v2 Migration
-- 와인 세부 정보 제거, 경험 중심 컬럼으로 전환
-- Supabase SQL Editor 에서 실행하세요.
-- ============================================================

-- 1. 새 컬럼 추가
ALTER TABLE wine_records
  ADD COLUMN IF NOT EXISTS wine_vivino_url TEXT,
  ADD COLUMN IF NOT EXISTS photos TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pairing_score INTEGER CHECK (pairing_score BETWEEN 1 AND 5);

-- 2. 기존 label_image_url → photos 배열로 이전
UPDATE wine_records
  SET photos = ARRAY[label_image_url]
  WHERE label_image_url IS NOT NULL AND label_image_url != '';

-- 3. 불필요한 컬럼 제거
ALTER TABLE wine_records
  DROP COLUMN IF EXISTS vintage,
  DROP COLUMN IF EXISTS country,
  DROP COLUMN IF EXISTS region,
  DROP COLUMN IF EXISTS grapes,
  DROP COLUMN IF EXISTS producer,
  DROP COLUMN IF EXISTS type,
  DROP COLUMN IF EXISTS label_image_url,
  DROP COLUMN IF EXISTS price,
  DROP COLUMN IF EXISTS balance,
  DROP COLUMN IF EXISTS complexity,
  DROP COLUMN IF EXISTS value_score;
