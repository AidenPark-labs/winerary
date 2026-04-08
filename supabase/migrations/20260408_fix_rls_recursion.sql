-- RLS 무한 재귀 수정: wine_records ↔ record_mentions 순환 참조 해결

-- 1. 기존 문제 정책 삭제
DROP POLICY IF EXISTS "record_mentions: author manage" ON record_mentions;
DROP POLICY IF EXISTS "wine_records: mentioned read" ON wine_records;

-- 2. record_mentions: 작성자 관리 → wine_records 참조 없이 직접 체크
--    INSERT 시에는 record_id의 소유자 확인이 필요하지만, 서버 액션에서만 호출되므로
--    authenticated 유저가 자신이 멘션한 것만 관리 가능하도록 분리

-- 레코드 작성자가 멘션 삽입 가능 (WITH CHECK만 사용)
CREATE POLICY "record_mentions: author insert" ON record_mentions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM wine_records
      WHERE wine_records.id = record_mentions.record_id
        AND wine_records.user_id = auth.uid()
    )
  );

-- 레코드 작성자가 멘션 삭제 가능
CREATE POLICY "record_mentions: author delete" ON record_mentions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM wine_records
      WHERE wine_records.id = record_mentions.record_id
        AND wine_records.user_id = auth.uid()
    )
  );

-- 3. wine_records: 멘션된 유저 조회 → SECURITY DEFINER ���수로 순환 회피
CREATE OR REPLACE FUNCTION is_mentioned_in_record(p_record_id uuid, p_user_id uuid)
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

CREATE POLICY "wine_records: mentioned read" ON wine_records
  FOR SELECT USING (
    is_mentioned_in_record(id, auth.uid())
    AND deleted_at IS NULL
  );
