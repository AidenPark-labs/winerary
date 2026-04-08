-- final_* 컬럼: 수동 오버라이드용 최종 표시 데이터
-- null이면 자동 선택 (vivino > naver), 값이 있으면 수동 오버라이드
ALTER TABLE wines ADD COLUMN final_grapes text;
ALTER TABLE wines ADD COLUMN final_region text;
ALTER TABLE wines ADD COLUMN final_country text;
ALTER TABLE wines ADD COLUMN final_producer text;
ALTER TABLE wines ADD COLUMN final_wine_type text;
ALTER TABLE wines ADD COLUMN final_alcohol text;
ALTER TABLE wines ADD COLUMN final_style text;
ALTER TABLE wines ADD COLUMN final_description text;
