-- 가격 유형 구분 (시장가/소매가, 바틀/글라스)
ALTER TABLE wine_records
  ADD COLUMN IF NOT EXISTS price_type TEXT CHECK (price_type IN ('market', 'retail')),
  ADD COLUMN IF NOT EXISTS price_unit TEXT CHECK (price_unit IN ('bottle', 'glass'));
