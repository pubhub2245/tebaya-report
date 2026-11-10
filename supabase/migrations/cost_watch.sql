-- ============================================================
-- 原価率の見張り（2026-11-10 じゅん決定）
-- ============================================================
-- 現場は今までどおり「伝票とレシートを撮るだけ」。撮ったレシートの品物から材料の単価を拾い、
-- 商品ごとの原価率を計算し直して、目安を超えたら日報の LINE に1行添える。
-- 計算の本体は lib/costWatch.ts（tests/costWatch.test.ts）。画面は /admin/cost。
--
-- ★ 追加のみ。日報・商品マスタ・経理のテーブルには一切触れない（帳簿の金額は変わらない）。
-- ★ 鍵（RLS）は他の業務テーブルと同じ「全員OK」（CLAUDE.md 4-8 の「次の段階」で締める対象）。
-- ★ tenant_id は空＝手羽屋。いまは手羽屋だけで使う。
-- 何度実行しても安全。

create table if not exists public.cost_materials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  name text not null,
  unit text not null,                 -- kg / g / L / ml / 袋 / 本 / 個 など
  unit_price numeric,                 -- 1単位の値段（円）。分からなければ空
  keywords text[] not null default '{}',  -- レシートの品物名を見分ける言葉
  price_updated_on date,
  price_source text,                  -- receipt / manual
  note text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cost_recipes (
  id uuid primary key default gen_random_uuid(),
  product_id bigint not null references public.sale_products(id),
  material_id uuid not null references public.cost_materials(id),
  yield_per_unit numeric not null check (yield_per_unit > 0), -- 材料1単位で何個ぶん作れるか
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, material_id)
);

create table if not exists public.cost_targets (
  product_id bigint primary key references public.sale_products(id),
  target_ratio numeric not null default 30 check (target_ratio > 0 and target_ratio < 100),
  updated_at timestamptz not null default now()
);

create table if not exists public.cost_price_log (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.cost_materials(id),
  observed_on date not null,
  report_id uuid,                     -- どの日報のレシートから拾ったか（手入力なら空）
  description text,
  amount integer,
  qty numeric,
  unit_price numeric,                 -- 量が読めなければ空
  applied boolean not null default false, -- 材料の単価を書き換えたか
  reason text,                        -- 書き換えなかった理由
  created_at timestamptz not null default now()
);
create index if not exists cost_price_log_material_idx on public.cost_price_log (material_id, observed_on desc);

comment on table public.cost_materials is '原価率の見張り：材料（買う単位・単価・レシートを見分ける言葉）。画面は /admin/cost';
comment on table public.cost_recipes is '原価率の見張り：商品ごとの材料（材料1単位で何個ぶん作れるか）';
comment on table public.cost_targets is '原価率の見張り：商品ごとの原価率の目安（%）';
comment on table public.cost_price_log is '原価率の見張り：レシートから拾った単価の記録';

do $$
declare t text;
begin
  foreach t in array array['cost_materials','cost_recipes','cost_targets','cost_price_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_all_public', t);
    execute format('create policy %I on public.%I for all using (true) with check (true)', t || '_all_public', t);
  end loop;
end $$;
