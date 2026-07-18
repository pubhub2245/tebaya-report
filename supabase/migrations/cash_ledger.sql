-- 現金出納帳（げんきんすいとうちょう）
-- 事業全体で「今いくら現金を持っているか」を管理するためのテーブル。
--
-- 計算式：
--   手元の現金 = 期首残高
--              + （期首日以降の売上合計：daily_reports から自動）
--              + 手動入金の合計
--              − 手動出金の合計
--
-- 売上は日報（daily_reports）から自動で足すため、ここには
-- 「銀行入金・引き出し・経費精算など、売上以外の現金の出入り」だけを記録する。

-- ── 期首残高（スタート地点）設定。運用上は1行だけ持つ ──
CREATE TABLE IF NOT EXISTS cash_ledger_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opening_date DATE NOT NULL,          -- この日の朝の時点の現金を opening_balance とする
  opening_balance INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

ALTER TABLE cash_ledger_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cash_ledger_settings_all_public" ON cash_ledger_settings;
CREATE POLICY "cash_ledger_settings_all_public" ON cash_ledger_settings
  FOR ALL USING (true) WITH CHECK (true);

-- ── 手動の入金・出金記録 ──
CREATE TABLE IF NOT EXISTS cash_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')), -- in=入金(増える) / out=出金(減る)
  amount INTEGER NOT NULL CHECK (amount >= 0),
  category TEXT NOT NULL DEFAULT 'その他',
  memo TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_ledger_entries_date ON cash_ledger_entries(date);

ALTER TABLE cash_ledger_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cash_ledger_entries_all_public" ON cash_ledger_entries;
CREATE POLICY "cash_ledger_entries_all_public" ON cash_ledger_entries
  FOR ALL USING (true) WITH CHECK (true);
