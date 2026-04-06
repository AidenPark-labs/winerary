-- 1. pending_wines 테이블 (유저가 직접 입력한 미등록 와인)
CREATE TABLE pending_wines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ko text NOT NULL,
  name_en text,
  wine_type text CHECK (wine_type IN ('red','white','rose','sparkling','fortified','other')),
  country text,
  grape_variety text,
  producer text,
  submitted_by uuid REFERENCES profiles(id),
  record_count integer DEFAULT 1,
  promoted_wine_id uuid REFERENCES wines(id),
  status text DEFAULT 'pending' CHECK (status IN ('pending','promoted','rejected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX pending_wines_name_ko_idx ON pending_wines USING gin(to_tsvector('simple', name_ko));
CREATE INDEX pending_wines_status_idx ON pending_wines(status);

ALTER TABLE pending_wines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pending_wines: public read" ON pending_wines FOR SELECT USING (true);
CREATE POLICY "pending_wines: auth insert" ON pending_wines FOR INSERT WITH CHECK (auth.uid() = submitted_by);
CREATE POLICY "pending_wines: service manage" ON pending_wines FOR UPDATE USING (true);
CREATE POLICY "pending_wines: service delete" ON pending_wines FOR DELETE USING (true);

-- 2. wine_records에 wine_id, pending_wine_id 추가
ALTER TABLE wine_records ADD COLUMN wine_id uuid REFERENCES wines(id) ON DELETE SET NULL;
ALTER TABLE wine_records ADD COLUMN pending_wine_id uuid REFERENCES pending_wines(id) ON DELETE SET NULL;
CREATE INDEX wine_records_wine_id_idx ON wine_records(wine_id) WHERE wine_id IS NOT NULL;
CREATE INDEX wine_records_pending_wine_id_idx ON wine_records(pending_wine_id) WHERE pending_wine_id IS NOT NULL;
