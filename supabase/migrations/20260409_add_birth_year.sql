-- profiles 테이블에 출생연도 컬럼 추가
alter table profiles add column if not exists birth_year integer;
