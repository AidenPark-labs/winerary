-- raw_wines: 수집 staging 테이블
-- 수집 스크립트의 파싱 버그가 라이브 wines 테이블을 오염시키지 않도록,
-- 모든 수집 결과를 먼저 이 테이블에 적재한다.
-- (vivino 보강, promote는 이후 별도 단계에서 추가 예정)

CREATE TABLE raw_wines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,             -- 'gangnam' | 'winenara' | 'naver_shopping'
  source_id text NOT NULL,          -- branduid, product_cd 등 사이트 고유 ID
  collected_at timestamptz DEFAULT now(),

  name_ko text,
  name_en text,
  wine_type text,
  country text,
  region text,
  grape_variety text,
  producer text,
  description text,
  price integer,
  image_url text,
  alcohol text,
  raw_payload jsonb,

  UNIQUE (source, source_id)
);

-- 어드민(service_role)만 접근. anon 차단.
ALTER TABLE raw_wines ENABLE ROW LEVEL SECURITY;
