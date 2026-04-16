-- record_mentions: 레코드 작성자가 자신의 멘션을 조회할 수 있도록 SELECT 정책 추가
-- 기존 fix_rls_recursion에서 FOR ALL → INSERT/DELETE 분리 시 SELECT가 누락됨
CREATE POLICY "record_mentions: author select" ON record_mentions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM wine_records
      WHERE wine_records.id = record_mentions.record_id
        AND wine_records.user_id = auth.uid()
    )
  );
