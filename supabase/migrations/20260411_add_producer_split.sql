-- producer 한/영 분리 컬럼 추가
--
-- 배경:
-- 기존 producer 컬럼은 한/영 혼재 (예: "프레스코발디" / "Marchesi de' Frescobaldi").
-- wine21 수집부터는 winery_ko / winery_en을 분리해서 받을 수 있으므로
-- 새 컬럼에 깔끔하게 적재한다.
--
-- 정책:
-- - 기존 producer 컬럼은 legacy 호환용으로 유지 (drop 안 함)
-- - 신규 수집은 producer_ko / producer_en에 채움
-- - name_ko / name_en은 머지 형태("{producer_ko} {wine_part}") 그대로 유지
--   → 와인 본명만 필요하면 name_ko에서 producer_ko를 빼서 즉석 도출

ALTER TABLE wines     ADD COLUMN producer_ko text;
ALTER TABLE wines     ADD COLUMN producer_en text;

ALTER TABLE raw_wines ADD COLUMN producer_ko text;
ALTER TABLE raw_wines ADD COLUMN producer_en text;

-- 검색/dedupe 보조 인덱스 (raw_wines는 수집 dedupe에 자주 쓰임)
CREATE INDEX raw_wines_producer_ko_idx ON raw_wines (producer_ko);
