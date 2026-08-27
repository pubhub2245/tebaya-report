-- 使っていないテーブルを削除する（2026-08-27）
--
-- ■ 消したもの（すべてコードからの参照0・他テーブルからの参照0を確認済み）
--   tasks                 … 6件・最終2026-04-16。対応する画面が存在しない抜け殻
--   cash_ledger_entries   … 0件。現金出納帳の作りかけ。一度も使われていない
--   cash_ledger_settings  … 1件。同上
--   gmail_tokens          … 0件。Gmail連携の作りかけ。一度も使われていない
--
-- ■ 消す前に必ずやったこと
--   中身をまるごと table_snapshots に控えとして保存した。
--     deleted_tasks_20260827 / deleted_cash_ledger_entries_20260827 /
--     deleted_cash_ledger_settings_20260827 / deleted_gmail_tokens_20260827
--   この控えは毎日の自動削除の対象外（lib/backup.ts は CRITICAL_TABLES しか消さない）。
--   元に戻したくなったら、この控えから復元できる。
--
-- ■ 消さなかったもの（あわせて記録しておく）
--   pkmn_* の6テーブル … 手羽屋とは別のアプリのデータで、**今も使われている**
--     （応募538件・最終2026-08-23、抽選34件、写真293枚）。消すとそのアプリが壊れる。
--   festival_events / weather_alerts … 今回の対象外。
--
-- ★ この操作は取り消せない（DROP TABLE）。控えを取ってから実行すること。

drop table if exists public.tasks;
drop table if exists public.cash_ledger_entries;
drop table if exists public.cash_ledger_settings;
drop table if exists public.gmail_tokens;
