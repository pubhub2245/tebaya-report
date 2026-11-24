-- ============================================================
-- お店の中の連絡用 公式LINE「手羽屋 ばあちゃんち」（@719sepmw・2026-11-24）が
-- 入っているLINEグループの控え。
-- ★ スタッフ向けBot「手羽屋業務連絡」の line_groups とは別の棚（同じグループに両方のBotが入れるため）。
-- ★ 書くのはサーバー（/api/line/shop/webhook）だけ。読むのは管理者ページの /api だけ。適用済み（2026-11-24）。
-- 何度実行しても安全。
-- ============================================================
create table if not exists public.line_shop_groups (
  group_id text primary key,
  is_active boolean not null default true,
  joined_at timestamptz not null default now()
);

alter table public.line_shop_groups enable row level security;
-- ポリシーは line_groups と揃える（全員OK・→ CLAUDE.md 4-8）。サーバーの鍵が壊れていても受け口が止まらないように。
drop policy if exists line_shop_groups_select on public.line_shop_groups;
drop policy if exists line_shop_groups_insert on public.line_shop_groups;
drop policy if exists line_shop_groups_update on public.line_shop_groups;
create policy line_shop_groups_select on public.line_shop_groups for select using (true);
create policy line_shop_groups_insert on public.line_shop_groups for insert with check (true);
create policy line_shop_groups_update on public.line_shop_groups for update using (true);

comment on table public.line_shop_groups is
  'お店の中の連絡用 公式LINE（手羽屋 ばあちゃんち）が入っているグループ。スタッフ向けの line_groups とは別';
