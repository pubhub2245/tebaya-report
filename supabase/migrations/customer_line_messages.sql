-- ============================================================
-- お客さん向け公式LINE（@276msmys）の受け口：第1段階
-- ============================================================
-- お客さんが公式LINEに送ってきたメッセージと、友だち追加・ブロックの出来事を
-- 記録するテーブル。書き込みはサーバー（/api/line/customer/webhook）から行う。
--
-- ★ スタッフ向けBot（line_groups）とは別物。既存テーブルは一切触らない。
-- ★ RLS は既存テーブルと同じ「全員OK」方針（→ CLAUDE.md 4-8）。
--    サーバーは service_role で書き、管理画面はブラウザから anon で読む。
--
-- 適用方法:
--   Supabase ダッシュボード SQL Editor から実行する（何度実行しても安全）。

-- 受信メッセージ
create table if not exists public.customer_line_messages (
  id uuid primary key default gen_random_uuid(),

  -- LINE が付けるお客さんのID（U + 32文字）。名前ではない
  line_user_id text not null,

  -- text / image / sticker / video / audio / file / location など
  message_type text not null,

  -- 本文。テキスト以外は "[画像]" のように種別を入れる
  message_text text,

  -- LINE 側の受信時刻
  received_at timestamptz not null default now(),

  -- LINE から届いたイベントをそのまま控える（あとで読み直せるように）
  raw jsonb,

  -- new（未対応）/ handled（対応済み）。第1段階では new のまま
  status text not null default 'new',

  created_at timestamptz default now()
);

comment on table public.customer_line_messages is
  'お客さん向け公式LINE（@276msmys）に届いたメッセージ。スタッフ向けBotとは別。';
comment on column public.customer_line_messages.status is
  'new=未対応 / handled=対応済み';

create index if not exists idx_customer_line_messages_received
  on public.customer_line_messages (received_at desc);
create index if not exists idx_customer_line_messages_user
  on public.customer_line_messages (line_user_id, received_at desc);

-- 友だち追加・ブロックなどの出来事
create table if not exists public.customer_line_events (
  id uuid primary key default gen_random_uuid(),
  line_user_id text,
  event_type text,
  occurred_at timestamptz default now(),
  raw jsonb
);

comment on table public.customer_line_events is
  'お客さん向け公式LINEの友だち追加（follow）・ブロック（unfollow）の記録。';

create index if not exists idx_customer_line_events_occurred
  on public.customer_line_events (occurred_at desc);

-- 既存テーブルと同じく anon クライアントから読める（管理画面の一覧用）
grant select, insert, update, delete on public.customer_line_messages to anon, authenticated;
grant select, insert, update, delete on public.customer_line_events to anon, authenticated;

alter table public.customer_line_messages enable row level security;
drop policy if exists "customer_line_messages_all_public" on public.customer_line_messages;
create policy "customer_line_messages_all_public" on public.customer_line_messages
  for all using (true) with check (true);

alter table public.customer_line_events enable row level security;
drop policy if exists "customer_line_events_all_public" on public.customer_line_events;
create policy "customer_line_events_all_public" on public.customer_line_events
  for all using (true) with check (true);
