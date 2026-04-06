-- 와인 기록에 장소 좌표 추가 (네이버 플레이스 + 카카오맵 연동)
ALTER TABLE wine_records
  ADD COLUMN IF NOT EXISTS place_name TEXT,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS wine_records_lat_lng_idx
  ON wine_records (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
