-- 와인 기록에 태그 추가
ALTER TABLE wine_records
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
