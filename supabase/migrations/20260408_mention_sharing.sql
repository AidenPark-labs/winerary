-- 1. profiles에 user_code 추가 (8자리 영숫자 고유 코드)
ALTER TABLE profiles ADD COLUMN user_code text UNIQUE;

-- 기존 유저에 랜덤 코드 생성
UPDATE profiles SET user_code = upper(substr(md5(random()::text), 1, 8))
WHERE user_code IS NULL;

-- NOT NULL 제약 추가
ALTER TABLE profiles ALTER COLUMN user_code SET NOT NULL;

-- user_code 기본값: 신규 가입 시 자동 생성
ALTER TABLE profiles ALTER COLUMN user_code SET DEFAULT upper(substr(md5(random()::text), 1, 8));

-- profiles: 인증된 유저가 닉네임/코드로 다른 유저 검색 가능
CREATE POLICY "profiles: authenticated read" ON profiles
  FOR SELECT USING (auth.role() = 'authenticated');

-- 2. record_mentions 테이블
CREATE TABLE record_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid REFERENCES wine_records(id) ON DELETE CASCADE NOT NULL,
  mentioned_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(record_id, mentioned_user_id)
);

CREATE INDEX record_mentions_user_idx ON record_mentions(mentioned_user_id);
CREATE INDEX record_mentions_record_idx ON record_mentions(record_id);

ALTER TABLE record_mentions ENABLE ROW LEVEL SECURITY;

-- 멘션된 유저 본인 조회 가능
CREATE POLICY "record_mentions: own read" ON record_mentions
  FOR SELECT USING (auth.uid() = mentioned_user_id);

-- 레코드 작성자가 멘션 추가/삭제 가능
CREATE POLICY "record_mentions: author manage" ON record_mentions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM wine_records
      WHERE wine_records.id = record_mentions.record_id
        AND wine_records.user_id = auth.uid()
    )
  );

-- 3. wine_records: 멘션된 유저가 해당 레코드 조회 가능
CREATE POLICY "wine_records: mentioned read" ON wine_records
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM record_mentions
      WHERE record_mentions.record_id = wine_records.id
        AND record_mentions.mentioned_user_id = auth.uid()
    )
    AND deleted_at IS NULL
  );
