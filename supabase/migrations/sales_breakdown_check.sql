-- 売上と商品内訳の突き合わせ。
--
-- これまで手羽先の本数は「売上 − ほかの商品 ÷ 単価」で逆算していたため、
-- 内訳は売上から作った数字であり、検算になっていなかった。
-- これからは全商品の本数を入力し、その合計と売上を突き合わせる。
-- 合わないときは理由を残す。

alter table public.daily_reports
  add column if not exists product_prices        jsonb   not null default '{}'::jsonb,
  add column if not exists breakdown_total       integer not null default 0,
  add column if not exists breakdown_diff        integer not null default 0,
  add column if not exists breakdown_diff_reason text,
  add column if not exists breakdown_diff_note   text;

comment on column public.daily_reports.product_prices is
  'その日に使った商品ごとの単価 {商品名: 単価}。あとで値上げしても過去の日報を再計算できるようにするための控え。';
comment on column public.daily_reports.breakdown_total is
  '商品ごとの「単価×本数」を合計した金額。';
comment on column public.daily_reports.breakdown_diff is
  '売上 − 内訳合計。0なら一致。プラスなら売上のほうが多い（数え漏れの可能性）。';
comment on column public.daily_reports.breakdown_diff_reason is
  '一致しなかった理由のコード（discount / freebie / register_error / count_unsure / other）。一致していれば NULL。';
comment on column public.daily_reports.breakdown_diff_note is
  '理由が other のときの自由記入。';

-- 限定商品の単価は月によって変わるので、月ごとに持たせる
alter table public.monthly_limited_products
  add column if not exists price integer not null default 0;

comment on column public.monthly_limited_products.price is
  'その月の限定商品の単価（円）。0のままだと内訳に金額が入らないので必ず設定する。';

-- お酒が商品マスタから消えているので戻す。
-- 単価0＝「記録のみ」。売上に入れる場合は管理者ページの商品マスタで
-- 単価を入れて種別を「通常」に変更する。
insert into public.sale_products (shop, name, price, kind, sort_order)
select '手羽屋', 'お酒', 0, 'count_only', 90
where not exists (
  select 1 from public.sale_products where shop = '手羽屋' and name = 'お酒'
);

insert into public.sale_products (shop, name, price, kind, sort_order)
select 'もも屋', 'お酒', 0, 'count_only', 90
where not exists (
  select 1 from public.sale_products where shop = 'もも屋' and name = 'お酒'
);
