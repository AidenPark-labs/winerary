-- 1. wine_records에 초대 코드 추가
ALTER TABLE wine_records ADD COLUMN invite_code text UNIQUE;

-- 2. record_evaluations: 비회원 평가 지원
ALTER TABLE record_evaluations ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE record_evaluations ADD COLUMN guest_nickname text;
ALTER TABLE record_evaluations DROP CONSTRAINT record_evaluations_record_id_user_id_key;
ALTER TABLE record_evaluations ADD CONSTRAINT record_evaluations_unique_eval
  UNIQUE NULLS NOT DISTINCT (record_id, user_id, guest_nickname);

-- 3. 비회원 평가 허용 RLS
CREATE POLICY "record_evaluations: guest insert" ON record_evaluations
  FOR INSERT WITH CHECK (
    user_id IS NULL
    AND guest_nickname IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM wine_records
      WHERE wine_records.id = record_evaluations.record_id
        AND wine_records.invite_code IS NOT NULL
    )
  );

-- 4. 초대 코드가 있는 레코드의 평가는 누구나 조회 가능
CREATE POLICY "record_evaluations: invite read" ON record_evaluations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM wine_records
      WHERE wine_records.id = record_evaluations.record_id
        AND wine_records.invite_code IS NOT NULL
    )
  );
