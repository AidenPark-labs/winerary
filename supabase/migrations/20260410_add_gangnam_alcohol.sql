-- 강남와인(gangnam.wine) 수집 데이터 중 도수 정보 저장용 컬럼
-- vivino_alcohol 패턴과 동일하게 소스 전용 컬럼으로 둠
ALTER TABLE wines ADD COLUMN IF NOT EXISTS gangnam_alcohol text;
