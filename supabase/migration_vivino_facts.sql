-- Vivino 상세 정보 컬럼 추가
ALTER TABLE wines
  ADD COLUMN IF NOT EXISTS vivino_winery TEXT,
  ADD COLUMN IF NOT EXISTS vivino_grapes TEXT,
  ADD COLUMN IF NOT EXISTS vivino_region TEXT,
  ADD COLUMN IF NOT EXISTS vivino_style TEXT,
  ADD COLUMN IF NOT EXISTS vivino_alcohol TEXT,
  ADD COLUMN IF NOT EXISTS vivino_description TEXT,
  ADD COLUMN IF NOT EXISTS vivino_allergens TEXT;
