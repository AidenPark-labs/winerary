-- 공유받은 기록에 대한 평가 테이블
CREATE TABLE record_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid REFERENCES wine_records(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  rating numeric(3,1) CHECK (rating BETWEEN 1 AND 5),
  value_score numeric(3,1) CHECK (value_score BETWEEN 1 AND 5),
  pairing_score integer CHECK (pairing_score BETWEEN 1 AND 5),
  memo text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(record_id, user_id)
);

CREATE INDEX record_evaluations_record_idx ON record_evaluations(record_id);

ALTER TABLE record_evaluations ENABLE ROW LEVEL SECURITY;

-- 본인 평가 관리 (CRUD)
CREATE POLICY "record_evaluations: own manage" ON record_evaluations
  FOR ALL USING (auth.uid() = user_id);

-- 레코드 작성자도 평가 조회 가능
CREATE POLICY "record_evaluations: author read" ON record_evaluations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM wine_records
      WHERE wine_records.id = record_evaluations.record_id
        AND wine_records.user_id = auth.uid()
    )
  );

-- 멘션된 유저도 같은 레코드의 다른 평가 조회 가능
CREATE OR REPLACE FUNCTION can_read_record_evaluation(p_record_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM record_mentions
    WHERE record_id = p_record_id
      AND mentioned_user_id = p_user_id
  );
$$;

CREATE POLICY "record_evaluations: mentioned read" ON record_evaluations
  FOR SELECT USING (
    can_read_record_evaluation(record_id, auth.uid())
  );
