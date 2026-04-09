-- 소믈리에 대화 메시지
CREATE TABLE sommelier_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX sommelier_messages_user_idx ON sommelier_messages(user_id);
ALTER TABLE sommelier_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sommelier_messages: own" ON sommelier_messages FOR ALL USING (auth.uid() = user_id);

-- 소믈리에 컨텍스트 (사용자당 1행: 대화 요약 + 취향 프로필)
CREATE TABLE sommelier_context (
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  summary text NOT NULL DEFAULT '',
  taste_profile text NOT NULL DEFAULT '',
  last_summarized_at timestamptz,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE sommelier_context ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sommelier_context: own" ON sommelier_context FOR ALL USING (auth.uid() = user_id);
