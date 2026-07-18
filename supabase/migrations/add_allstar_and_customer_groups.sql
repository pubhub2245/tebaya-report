-- オールスター（¥1,300の詰め合わせ商品）の販売本数と、
-- お客さんの組数（客数）を日報に記録するためのカラム追加。

ALTER TABLE daily_reports
  ADD COLUMN IF NOT EXISTS allstar_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_groups INTEGER NOT NULL DEFAULT 0;
