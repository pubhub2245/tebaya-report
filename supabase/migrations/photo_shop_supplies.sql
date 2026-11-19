-- ============================================================
-- 使う備品・材料：お店が画面から足した品物（2026-11-19）
--
-- ■ やさしい説明
--   「使う備品・材料」（/supplies）の一覧は、はじめは lib/supplies.ts に書いた14点。
--   それに、お店の人が画面から足した品物を、この棚に1行ずつ入れる。
--   どのお店の品物かは tenant_id で分ける（よそのお店の一覧には出ない）。
--
-- ■ 鍵
--   ほかの業務の棚と同じく、画面から直接読み書きする作り（CLAUDE.md 4-8）。
--   中身は品物の名前・使いみち・棚札の値段・写真だけで、お金の記録は入れない。
--
-- ★ 追加だけ。既存の棚には触れていない。
-- ============================================================

create table if not exists public.photo_shop_supplies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.keiri_tenants(id),
  group_title text not null default 'お店で足したもの',
  name text not null check (char_length(name) between 1 and 60),
  detail text check (detail is null or char_length(detail) <= 120),
  use_for text check (use_for is null or char_length(use_for) <= 60),
  price_tax_in integer check (price_tax_in is null or (price_tax_in >= 0 and price_tax_in <= 1000000)),
  photo text,
  created_at timestamptz not null default now()
);
create index if not exists photo_shop_supplies_tenant_idx on public.photo_shop_supplies (tenant_id, created_at);

alter table public.photo_shop_supplies enable row level security;
create policy photo_shop_supplies_select on public.photo_shop_supplies for select to anon, authenticated using (true);
create policy photo_shop_supplies_insert on public.photo_shop_supplies for insert to anon, authenticated with check (true);
create policy photo_shop_supplies_delete on public.photo_shop_supplies for delete to anon, authenticated using (true);
grant select, insert, delete on public.photo_shop_supplies to anon, authenticated;

comment on table public.photo_shop_supplies is
  '使う備品・材料（/supplies）にお店が画面から足した品物。tenant_id でお店を分ける（2026-11-19）';
