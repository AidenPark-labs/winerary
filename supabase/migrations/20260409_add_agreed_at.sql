-- profiles 테이블에 약관/개인정보처리방침 동의 일시 컬럼 추가
alter table profiles add column if not exists agreed_at timestamptz;
