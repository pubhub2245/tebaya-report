-- 経理画面（/keiri）で使う2つのテーブル。
-- 設計は docs/keiri.md を参照。
--
-- ■ 何をするファイルか
--   「数え始めの日と、そのときの現金」（keiri_settings）と、
--   「給与・Alphaに実際に払った記録」（keiri_payments）を入れる棚を作ります。
--
-- ■ 安全について
--   **追加だけ**です。既存のテーブル（daily_reports / cash_settings など）は
--   1文字も変更しません。cash_settings（/cash が使う期首残高）とは別物で、
--   /cash の表示は一切変わりません。

-- ------------------------------------------------------------------
-- 1. keiri_settings … 業態ごとの設定（1業態＝1行）
-- ------------------------------------------------------------------
create table if not exists keiri_settings (
  id bigint generated always as identity primary key,
  -- 業態コード。手羽屋は 'tebaya'。他の業態を足すときはここを変えた行を足す
  business_type_code text not null default 'tebaya',
  -- 数え始めの日（期首日）
  opening_date date not null,
  -- 数え始めの日の現金（期首残高・円）
  opening_balance integer not null default 0,
  -- 外注費（Alpha）の率。0.10 = 売上高の10%
  outsourcing_rate numeric(6, 4) not null default 0.1000,
  memo text,
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint keiri_settings_business_type_uniq unique (business_type_code),
  constraint keiri_settings_rate_range check (outsourcing_rate >= 0 and outsourcing_rate <= 1)
);

-- 手羽屋の初期値：2026-08-10 ＝ 0円 ／ Alpha 10%
insert into keiri_settings (business_type_code, opening_date, opening_balance, outsourcing_rate, memo)
values ('tebaya', '2026-08-10', 0, 0.1000, '7月分給与の支払い後にちょうど0円になった日を起点にする')
on conflict (business_type_code) do nothing;

-- ------------------------------------------------------------------
-- 2. keiri_payments … 実際に払った記録（月1回）
-- ------------------------------------------------------------------
create table if not exists keiri_payments (
  id bigint generated always as identity primary key,
  business_type_code text not null default 'tebaya',
  -- 支払日
  paid_on date not null,
  -- 金額（円）
  amount integer not null,
  -- 種別： payroll = 給与 ／ outsourcing = 外注費（Alpha）
  kind text not null,
  memo text,
  created_at timestamptz not null default now(),
  created_by text,
  constraint keiri_payments_kind_check check (kind in ('payroll', 'outsourcing')),
  constraint keiri_payments_amount_check check (amount >= 0)
);

create index if not exists keiri_payments_paid_on_idx on keiri_payments (paid_on desc);

-- ------------------------------------------------------------------
-- 3. RLS（テーブルの鍵）
--    既存テーブルと同じ「全員OK」ポリシー。ブラウザから直接読み書きする作りのため。
--    （CLAUDE.md 4-8。本当に締めるのは次の段階）
-- ------------------------------------------------------------------
alter table keiri_settings enable row level security;
alter table keiri_payments enable row level security;

drop policy if exists "allow all keiri_settings" on keiri_settings;
create policy "allow all keiri_settings" on keiri_settings
  for all using (true) with check (true);

drop policy if exists "allow all keiri_payments" on keiri_payments;
create policy "allow all keiri_payments" on keiri_payments
  for all using (true) with check (true);

-- ------------------------------------------------------------------
-- 4. keiri_reports … 経理画面が読む「軽い日報」（ビュー＝見え方だけの棚）
--
-- ■ なぜ必要か
--   経理画面は、経費の種類を決めるために「説明の文字（description）」が要ります。
--   ところが日報の経費には**レシート写真がそのまま入っていることがある**ので、
--   そのまま取ると1か月ぶんで何百KBにもなり、画面が重くなります
--   （CLAUDE.md 4-2「集計画面は経費の明細を取得しない」）。
--
--   そこで「レシート写真の住所（receipt_image_url）だけを抜いた日報」を
--   ビュー（＝元のデータはそのままで、見え方だけを変えた棚）として用意します。
--   **元の daily_reports は1文字も変わりません。読み取り専用です。**
-- ------------------------------------------------------------------
create or replace view keiri_reports
with (security_invoker = true) as
select
  r.id,
  r.date,
  r.location,
  r.staff_name,
  r.shop,
  r.sales_amount,
  r.labor,
  coalesce(
    (
      select jsonb_agg(x - 'receipt_image_url')
      from jsonb_array_elements(
        case when jsonb_typeof(r.expenses) = 'array' then r.expenses else '[]'::jsonb end
      ) as x
    ),
    '[]'::jsonb
  ) as expenses
from daily_reports r;
