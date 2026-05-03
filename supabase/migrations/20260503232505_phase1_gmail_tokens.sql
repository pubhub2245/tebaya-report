-- Phase 1: Gmail OAuth トークン保管テーブル
--
-- ⚠️ セキュリティ注意:
--   このテーブルはアクセストークン・リフレッシュトークンを平文で保管する。
--   RLS ポリシーは「全員 SELECT/INSERT/UPDATE/DELETE 可」になっている（プロジェクト方針）。
--   将来的に厳格化する場合は service_role 限定への変更を検討すること。
--
-- 実行方法:
--   Supabase ダッシュボード SQL Editor から手動実行する。

-- 1. テーブル作成
CREATE TABLE IF NOT EXISTS gmail_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text UNIQUE NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  expiry_date timestamptz NOT NULL,
  scope text NOT NULL,
  token_type text DEFAULT 'Bearer',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. RLS 有効化（プロジェクト方針：選択肢A = 全員許可）
ALTER TABLE gmail_tokens ENABLE ROW LEVEL SECURITY;

-- ポリシーは存在チェック付きで作成（再実行対応）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'gmail_tokens'
      AND policyname = 'gmail_tokens_all_public'
  ) THEN
    CREATE POLICY gmail_tokens_all_public ON gmail_tokens
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 3. updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_gmail_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_gmail_tokens_updated_at ON gmail_tokens;
CREATE TRIGGER trigger_gmail_tokens_updated_at
  BEFORE UPDATE ON gmail_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_gmail_tokens_updated_at();
