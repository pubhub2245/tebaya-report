-- Phase 1: shifts テーブルの状態管理拡張
--
-- ⚠️ 本番適用前のチェック:
--   1. shifts テーブルの既存レコード数を把握しておく（ALTER 影響範囲確認）
--   2. このスクリプトの最終 UPDATE 文は note の値を見て初期化するため、
--      既存 note の中身を一度 SELECT して確認してから実行する
--
-- 実行方法:
--   Supabase ダッシュボード SQL Editor から手動実行する。
--   IF NOT EXISTS / IF EXISTS で冪等性を確保しているため、複数回実行しても安全。

-- 1. shift_status カラム追加（CHECK 制約付き）
--    既存全件は最初 'confirmed' にしておき、後続の UPDATE で 'pending' を上書きする。
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS shift_status text NOT NULL DEFAULT 'confirmed'
    CHECK (shift_status IN ('confirmed', 'pending', 'rejected'));

-- 2. ソース管理カラム追加
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS source_type text
    CHECK (source_type IN ('pdf', 'request_email', 'response_email', 'manual') OR source_type IS NULL);

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS source_message_id text;

-- 3. タイムスタンプカラム追加
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS requested_at timestamptz;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

-- 4. 拒否理由カラム追加
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS rejection_reason text;

-- 5. インデックス追加（検索性能向上）
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(shift_status);
CREATE INDEX IF NOT EXISTS idx_shifts_source_message ON shifts(source_message_id);

-- 6. 既存データの shift_status 初期化（C案：noteから推定）
--    note に「【未確定】」「【スタッフ要設定】」を含む行は pending として初期化。
--    その他は既定値 'confirmed' のまま。
UPDATE shifts SET shift_status = 'pending'
  WHERE note LIKE '%【未確定】%' OR note LIKE '%【スタッフ要設定】%';

-- 確認: 件数の確認用クエリ（実行後の検証に使う）
--   SELECT shift_status, COUNT(*) FROM shifts GROUP BY shift_status;
