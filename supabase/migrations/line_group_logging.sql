-- ============================================================
-- スタッフ向け LINE Bot「手羽屋業務連絡」のグループ会話記録と、
-- 決まった言葉への返信（reply のみ・push は使わない）
-- ============================================================
-- ★ 今月の無料枠が尽きていても動く仕組み：
--   返信はすべて replyToken を使う。push/multicast/broadcast は一切使わない。
--   LINE の仕様上、reply は通数に数えない。
--
-- ★ お客さん向け公式LINE（customer_line_*）とは別物。既存テーブルは触らない。
-- ★ RLS は既存の line_groups と揃える（全員OK）。書き込みはサーバー（/api/line/webhook）
--   が service_role で行い、管理画面はブラウザから anon で読む。
--
-- 適用方法:
--   Supabase ダッシュボード SQL Editor から実行する（何度実行しても安全）。

-- ----------------------------------------
-- 1. line_groups に「場所の名前」の欄を足す
-- ----------------------------------------
-- 既存の line_groups（group_id / is_active / joined_at）はそのまま使い、
-- どの店のグループかを人が分かる言葉で控えるための列だけ足す。
alter table public.line_groups
  add column if not exists label text;

comment on column public.line_groups.label is
  '人が分かる言葉（例「牟田町店」）。空でも動く。じゅんが管理画面から入れる想定';

-- ----------------------------------------
-- 2. グループの会話の記録
-- ----------------------------------------
create table if not exists public.line_group_messages (
  id uuid primary key default gen_random_uuid(),

  -- どのグループでの発言か
  group_id text not null,

  -- 控え：記録時点のグループの名前（人が読む用）。あとで変わっても過去が壊れない
  group_label text,

  -- 発言したユーザーの LINE 内部ID（名前ではない）
  user_id text,

  -- 表示名。グループメンバーのプロフィール取得APIが失敗することもあるので null 可。
  -- 取れたら入れる、取れなくても記録自体は続ける
  display_name text,

  -- text / image / sticker / video / audio / file / location / unknown など
  message_type text not null,

  -- 本文（テキストのときだけ入る。画像などは null でよい）
  text text,

  -- LINE が付けるメッセージID。同じイベントが再配送されたときの二重保存防止に使う。
  -- LINE Webhook は 200 を返しそこなうと同じイベントを何度も送ってくる
  line_message_id text unique,

  -- LINE から届いたイベントをそのまま控える（あとで読み直せるように）
  raw jsonb,

  created_at timestamptz not null default now()
);

comment on table public.line_group_messages is
  'スタッフ向けBot「手羽屋業務連絡」が入っているグループで交わされた会話の記録。';
comment on column public.line_group_messages.line_message_id is
  '同じイベントが再配送されたときの二重保存防止。unique で弾く';

create index if not exists idx_line_group_messages_created
  on public.line_group_messages (created_at desc);
create index if not exists idx_line_group_messages_group
  on public.line_group_messages (group_id, created_at desc);

-- ----------------------------------------
-- 3. 決まった言葉と返す文章の表
-- ----------------------------------------
-- コードに URL を直書きしないため、返す文章をここに置く。
-- group_id が null なら全グループ共通のキーワード。
-- 判定は「完全一致」のみ（普段の会話に反応させないため）。
create table if not exists public.line_group_replies (
  id uuid primary key default gen_random_uuid(),

  -- どのグループで有効か。null なら全グループ共通
  group_id text,

  -- 送られてきたテキストと**完全一致**したら、reply_text を返す
  keyword text not null,

  -- 返す文章（複数行可）
  reply_text text not null,

  -- 同じキーワードが複数ある場合の表示順（「リンク」で一覧を出すときに使う）
  sort_order integer not null default 0,

  is_active boolean not null default true,

  created_at timestamptz not null default now()
);

comment on table public.line_group_replies is
  'グループで決まった言葉が送られたときに返す文章。コードに直書きしないための置き場';
comment on column public.line_group_replies.keyword is
  '送られたテキストが完全一致したときだけ反応する。「リンク」だけは特別で、登録一覧を自動で返す';

create index if not exists idx_line_group_replies_keyword
  on public.line_group_replies (group_id, keyword)
  where is_active = true;

-- ----------------------------------------
-- 4. 最初のキーワード
-- ----------------------------------------
-- 「マニュアル」→ 準備中の案内。あとから URL を足せる
-- 「リンク」    → 文章は使われない（特別扱い。登録済みキーワードを自動で並べる）
insert into public.line_group_replies (group_id, keyword, reply_text, sort_order, is_active)
select null, 'マニュアル', '調理マニュアルはこちら：（準備中）', 10, true
where not exists (
  select 1 from public.line_group_replies
  where group_id is null and keyword = 'マニュアル'
);

insert into public.line_group_replies (group_id, keyword, reply_text, sort_order, is_active)
select null, 'リンク', '（特別扱い：登録されているキーワードの一覧を自動で返します）', 20, true
where not exists (
  select 1 from public.line_group_replies
  where group_id is null and keyword = 'リンク'
);

-- ----------------------------------------
-- 5. 既存テーブルに揃える権限と RLS
-- ----------------------------------------
grant select, insert, update, delete on public.line_group_messages to anon, authenticated;
grant select, insert, update, delete on public.line_group_replies to anon, authenticated;

alter table public.line_group_messages enable row level security;
drop policy if exists "line_group_messages_all_public" on public.line_group_messages;
create policy "line_group_messages_all_public" on public.line_group_messages
  for all using (true) with check (true);

alter table public.line_group_replies enable row level security;
drop policy if exists "line_group_replies_all_public" on public.line_group_replies;
create policy "line_group_replies_all_public" on public.line_group_replies
  for all using (true) with check (true);
