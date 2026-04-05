-- wines: 한국 유통 와인 DB
create table wines (
  id uuid primary key default gen_random_uuid(),
  name_ko text not null,
  name_en text,
  wine_type text check (wine_type in ('red','white','rose','sparkling','fortified','dessert','other')),
  country text,
  region text,
  grape_variety text,
  producer text,
  description text,
  price integer,
  naver_link text,
  naver_image text,
  vivino_url text,
  data_source text default 'naver_shopping',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 검색 성능을 위한 인덱스
create index wines_name_ko_idx on wines using gin (to_tsvector('simple', name_ko));
create index wines_wine_type_idx on wines (wine_type);
create index wines_country_idx on wines (country);
create index wines_price_idx on wines (price);

-- 중복 방지
create unique index wines_name_ko_unique on wines (name_ko);

-- RLS: 누구나 읽기 가능 (공개 데이터)
alter table wines enable row level security;
create policy "wines: public read" on wines for select using (true);
create policy "wines: service insert" on wines for insert with check (true);
create policy "wines: service update" on wines for update using (true);
