-- wines_v2 신설 (v5 단순화·정규화 마스터 테이블)
--
-- 배경:
--   기존 wines 테이블은 60+ 컬럼 + 한·영 데이터 혼재.
--   v5 전략 (docs/wines-schema-simplification.md): 새 테이블 wines_v2 신설 →
--   backfill·LLM 변환 → 단일 트랜잭션 swap (RENAME).
--
-- 정책 요약:
--   - id는 wines.id 그대로 사용 (FK 영향 0)
--   - 컬럼 29개, 단일 표준 언어
--     · 한글: country_ko (NOT NULL), region_ko, grape_varieties[], description
--     · 영문: name_en, wine_type(enum), wine_style, producer (단일), brand
--     · 이중: name_ko / name_en
--   - vivino_* 14컬럼은 별도 vivino_wines 테이블로 분리
--   - final_*, *_ko/_en 변형, naver_*/gangnam_* 등은 wines_v2에 흡수 또는 source_snapshot jsonb로
--   - 변환 검수: needs_review + needs_review_reasons text[]
--   - grape 비율: grape_blend jsonb로 분리 (이름은 grape_varieties)
--
-- swap 전 단계: 본 마이그레이션은 빈 테이블 생성만. RLS는 service_role write 전용
-- (anon/authenticated SELECT는 swap 시점에 별도 정책 추가).
--
-- 관련: docs/wines-schema-simplification.md §3.1, §5 Phase 0
--       memory/project_v5_normalization_decisions.md (정규화 정책)

BEGIN;

-- pgvector 확장 (기존 wines.embedding이 vector 타입이므로 이미 존재. 보조 안전망)
CREATE EXTENSION IF NOT EXISTS vector;

-- source enum 타입 (오타·잘못된 source 입력 차단)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wine_source') THEN
    CREATE TYPE public.wine_source AS ENUM (
      'wine21',
      'winenara',
      'gangnam',
      'naver_shopping',
      'user_submission',
      'admin'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.wines_v2 (
  -- 식별 (6)
  id              uuid PRIMARY KEY,
  source          public.wine_source NOT NULL,
  source_refs     uuid[],
  source_snapshot jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- 이름 (2) — 이중
  name_ko         text NOT NULL,
  name_en         text NOT NULL,

  -- 분류 (2)
  wine_type       text NOT NULL,           -- red/white/sparkling/rose/dessert/fortified/other
  wine_style      text,                    -- 영문, Vivino 식별자

  -- 지리 (2) — 한글
  country_ko      text NOT NULL,           -- 필수 (v3 정책: 와인 진입 4필드)
  region_ko       text,                    -- NULL 허용 (와인마다 정보 깊이 다름)

  -- 와이너리 (1) — 영문 단일
  producer        text,                    -- 영문 (canonical)

  -- 와인 정보 (5)
  grape_varieties text[],                  -- 한글, 프랑스식 발음 (이름만)
  grape_blend     jsonb,                   -- 비율 정보 [{"grape":"까베르네 소비뇽","percent":60}, ...]
  alcohol         numeric(4,2),
  brand           text,
  price           integer,

  -- 서빙 (3)
  description     text,                    -- 한글
  image_url       text,
  is_published    boolean NOT NULL DEFAULT true,

  -- 검색 (5)
  search_tsv      tsvector,
  search_jamo     text,
  embedding       vector(1536),
  embedded_at     timestamptz,
  search_query_en text,                    -- Vivino 검색용 영문 쿼리 텍스트

  -- 어드민 (1)
  locked_fields   text[],

  -- 변환 검수 (2)
  needs_review        boolean NOT NULL DEFAULT false,
  needs_review_reasons text[],             -- 변환 모호 사유 ["grape:Carmenère", "region:Tuscany"]

  -- 제약
  CONSTRAINT wines_v2_wine_type_check
    CHECK (wine_type IN ('red','white','sparkling','rose','dessert','fortified','other')),
  CONSTRAINT wines_v2_price_nonneg
    CHECK (price IS NULL OR price >= 0),
  CONSTRAINT wines_v2_name_ko_unique
    UNIQUE (name_ko)
);

-- 인덱스 (검색·필터·매칭 패턴 기준)
CREATE INDEX IF NOT EXISTS wines_v2_search_tsv_idx
  ON public.wines_v2 USING gin (search_tsv);

CREATE INDEX IF NOT EXISTS wines_v2_search_jamo_idx
  ON public.wines_v2 USING gin (search_jamo gin_trgm_ops);

CREATE INDEX IF NOT EXISTS wines_v2_embedding_idx
  ON public.wines_v2 USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS wines_v2_source_idx
  ON public.wines_v2 (source);

CREATE INDEX IF NOT EXISTS wines_v2_country_region_idx
  ON public.wines_v2 (country_ko, region_ko);

CREATE INDEX IF NOT EXISTS wines_v2_producer_idx
  ON public.wines_v2 (producer)
  WHERE producer IS NOT NULL;

CREATE INDEX IF NOT EXISTS wines_v2_is_published_idx
  ON public.wines_v2 (is_published);

CREATE INDEX IF NOT EXISTS wines_v2_needs_review_idx
  ON public.wines_v2 (needs_review)
  WHERE needs_review = true;

-- pg_trgm 확장 (search_jamo gin_trgm_ops 인덱스용)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wines_v2_set_updated_at ON public.wines_v2;
CREATE TRIGGER wines_v2_set_updated_at
  BEFORE UPDATE ON public.wines_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- search_tsv 자동 빌드 트리거
-- 가중치: A=name, B=producer, C=region/country, D=grape/wine_style/brand
CREATE OR REPLACE FUNCTION public.wines_v2_build_search_tsv()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('simple', coalesce(NEW.name_ko, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.name_en, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.producer, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.region_ko, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(NEW.country_ko, '')), 'C') ||
    setweight(to_tsvector('simple', array_to_string(coalesce(NEW.grape_varieties, ARRAY[]::text[]), ' ')), 'D') ||
    setweight(to_tsvector('simple', coalesce(NEW.wine_style, '')), 'D') ||
    setweight(to_tsvector('simple', coalesce(NEW.brand, '')), 'D');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wines_v2_search_tsv_trigger ON public.wines_v2;
CREATE TRIGGER wines_v2_search_tsv_trigger
  BEFORE INSERT OR UPDATE OF
    name_ko, name_en, producer,
    region_ko, country_ko, grape_varieties, wine_style, brand
  ON public.wines_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.wines_v2_build_search_tsv();

-- RLS: 현재는 service_role 전용 (swap 전이라 anon 노출 X)
-- swap 시점 별도 마이그레이션에서 anon SELECT 정책 추가
ALTER TABLE public.wines_v2 ENABLE ROW LEVEL SECURITY;

-- 명시적으로 anon/authenticated 차단 (정책 없으면 RLS는 deny by default지만 명시)
DROP POLICY IF EXISTS "wines_v2: service only" ON public.wines_v2;
CREATE POLICY "wines_v2: service only"
  ON public.wines_v2
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);
-- 주의: service_role은 RLS 우회하므로 어드민 페이지/스크립트는 정상 동작

COMMIT;
