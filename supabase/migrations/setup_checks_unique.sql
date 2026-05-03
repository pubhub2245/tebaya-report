-- setup_checks の重複登録防止
-- 同じ日 × 同じ店舗 × 同じスタッフ での複数登録を禁止する。
--
-- 対象列:
--   date         (date)
--   location     (text)
--   staff_name   (text)
--
-- 注意:
--   既存の重複データが残っているとこの CREATE UNIQUE INDEX は失敗する。
--   本番適用前に setup_checks 内の重複レコードを手動で確認・削除すること。
--   （安全のため、このマイグレーションでは DELETE は行わない。）
--
-- 適用方法:
--   Supabase ダッシュボード SQL Editor から手動で実行する。

CREATE UNIQUE INDEX IF NOT EXISTS setup_checks_unique_date_location_staff
  ON setup_checks (date, location, staff_name);
