-- wine_wishlist에 wine_id FK 추가 (wines 테이블과 연결)
alter table wine_wishlist
  add column if not exists wine_id uuid references wines(id) on delete set null;

-- wine_id로 빠른 조회를 위한 인덱스
create index if not exists idx_wine_wishlist_wine_id on wine_wishlist(wine_id);
