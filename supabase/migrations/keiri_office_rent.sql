-- 事務所の家賃（毎月35,000円）を経理画面に反映するための追加。
-- 設計は docs/keiri.md 5-3b を参照。
--
-- ■ 何をするファイルか
--   「毎月きまって出ていく事務所の家賃」を数えられるようにします。
--   家賃は日報には入らない（レジで払う経費ではない）ので、
--   金額と「何月分から数えるか」を設定として持ち、毎月自動で計上します。
--
-- ■ 支払い方（2026-09-02 川畑さんに確認）
--   レジのお金（手元現金）から、月に1回まとめて払っている。
--   → 給与・外注費（Alpha）とまったく同じ扱いにする。
--     ・利益では「発生した分」（毎月35,000円）を引く
--     ・今の現金では「実際に払った分だけ」を引く
--   そのため keiri_payments の種別に 'rent' を足します。
--
-- ■ 安全について
--   **追加だけ**です。既存の列・データは変更しません。

-- ------------------------------------------------------------------
-- 1. 設定に「毎月の家賃」と「数え始める月」を足す
-- ------------------------------------------------------------------
alter table keiri_settings
  add column if not exists monthly_rent integer not null default 0;

alter table keiri_settings
  add column if not exists rent_start_month text;

-- 家賃はマイナスにできない
alter table keiri_settings
  drop constraint if exists keiri_settings_monthly_rent_check;
alter table keiri_settings
  add constraint keiri_settings_monthly_rent_check check (monthly_rent >= 0);

-- 数え始める月は「YYYY-MM」の形だけ（空も可）
alter table keiri_settings
  drop constraint if exists keiri_settings_rent_start_month_check;
alter table keiri_settings
  add constraint keiri_settings_rent_start_month_check
  check (rent_start_month is null or rent_start_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

-- 手羽屋の値：毎月35,000円・2026年8月分から
update keiri_settings
   set monthly_rent = 35000,
       rent_start_month = '2026-08',
       updated_at = now()
 where business_type_code = 'tebaya'
   and monthly_rent = 0;

-- ------------------------------------------------------------------
-- 2. 支払い記録の種別に 'rent'（家賃）を足す
-- ------------------------------------------------------------------
alter table keiri_payments
  drop constraint if exists keiri_payments_kind_check;
alter table keiri_payments
  add constraint keiri_payments_kind_check
  check (kind in ('payroll', 'outsourcing', 'rent'));
