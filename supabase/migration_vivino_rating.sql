-- vivino_rating, vivino_reviews 컬럼 추가
alter table wines add column if not exists vivino_rating numeric(2,1);
alter table wines add column if not exists vivino_reviews integer;
create index if not exists wines_vivino_rating_idx on wines (vivino_rating);
