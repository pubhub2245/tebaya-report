-- 販売商品マスタ（お店ごとに商品名・単価・種別を管理。日報の本数入力/逆算に使う）
-- kind:
--   primary    … 売上から本数を逆算する主力商品（手羽屋＝手羽先 / もも屋＝もも焼き）。各店1つ想定。
--   normal     … 数を入力し「単価×数」を売上から差し引く商品（餃子・ポテト等）
--   count_only … 本数だけ記録し、売上計算には影響させない商品（お酒など）
create table if not exists public.sale_products (
  id bigint generated always as identity primary key,
  shop text not null default '手羽屋',
  name text not null,
  price integer not null default 0,
  kind text not null default 'normal' check (kind in ('primary','normal','count_only')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.sale_products is '販売商品マスタ。日報の商品本数入力・売上逆算に使用。管理画面から追加/編集可。';

grant select, insert, update, delete on public.sale_products to anon, authenticated;
create index if not exists idx_sale_products_shop on public.sale_products (shop, is_active, sort_order);

-- 手羽屋の現行商品を引っ越し（単価は現行ハードコード値）
insert into public.sale_products (shop, name, price, kind, sort_order) values
  ('手羽屋', '手羽先',       200, 'primary',    0),
  ('手羽屋', '餃子',         250, 'normal',     1),
  ('手羽屋', 'ポテト',       300, 'normal',     2),
  ('手羽屋', 'トルネード',   500, 'normal',     3),
  ('手羽屋', 'オールスター', 1300,'normal',     4),
  ('手羽屋', 'お酒',         0,   'count_only', 5),
  ('もも屋', 'お酒',         0,   'count_only', 5);
