-- wines 일반 alcohol 컬럼 추가
--
-- 배경:
--   raw_wines 에는 alcohol text 컬럼 있음 (모든 소스가 채움).
--   wines 에는 vivino_alcohol / gangnam_alcohol / final_alcohol 만 있고 "일반" alcohol 없음 →
--   promote / merge 시 raw.alcohol을 저장할 곳이 없어서 실제로 데이터 손실이 있었음.
--
-- 이 컬럼은 promote-v2 / insertWineDirectly / dedupe-review merge 등이
-- raw.alcohol 을 저장하는 기본 필드로 사용. vivino_alcohol / gangnam_alcohol /
-- final_alcohol 은 소스별·수동 오버라이드로 유지.

ALTER TABLE wines ADD COLUMN IF NOT EXISTS alcohol text;
