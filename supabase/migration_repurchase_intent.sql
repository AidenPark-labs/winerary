ALTER TABLE wine_records
  ADD COLUMN IF NOT EXISTS repurchase_intent TEXT CHECK (repurchase_intent IN ('yes', 'maybe', 'no'));
