-- ============================================================
-- イベント・お祭りの段取り表（2026-10-18 じゅんの依頼）
-- ============================================================
-- 決まったイベントごとに「鳥を何本頼むか・いつ頼むか・誰がいつ骨抜きするか・
-- どのフライヤーを使うか（電源があるか／ガスの補充が要るか）・会場の注意点」を
-- 1行にまとめて持つ表。画面は /events。
--
-- ★ 出店予定（shifts）とは別に持つ。shifts は「1行＝スタッフ1人ぶん」の勤務表で、
--   段取り（発注・仕込み・フライヤー）を入れる場所が無いため。
-- ★ 手羽屋の日報・シフト・レジ・LINE のテーブルには一切触れていない（追加のみ）。
-- ★ 鍵（RLS）は他の業務テーブルと同じ「全員OK」（ブラウザから直接読み書きする作り。
--   CLAUDE.md 4-8 の「次の段階」で締める対象に入る）。
--
-- 適用方法: Supabase ダッシュボード SQL Editor から実行する（何度実行しても安全）。

create table if not exists public.event_plans (
  id uuid primary key default gen_random_uuid(),

  -- いつ・どこで
  event_date date not null,
  event_name text not null,
  venue text,              -- 会場名（例：まちなか広場）
  venue_address text,      -- 住所
  open_time text,          -- 営業開始（例 09:00）
  close_time text,         -- 営業終了
  load_in text,            -- 搬入（例 08:00〜09:00）
  load_out text,           -- 搬出（例 13:00〜）

  -- 売上の想定と鳥
  expected_sales integer,  -- 売上の想定（円）
  chicken_count integer,   -- 手羽先の発注本数
  supplier text not null default '恵比寿商事',
  order_date date,         -- 発注日
  prep_date date,          -- 骨抜き・仕込みの日
  prep_start text,         -- 仕込みの開始時刻（例 16:00）。空でもよい
  prep_end text,           -- 仕込みの終了時刻（例 18:00）

  -- 誰が
  staff_prep text,         -- 骨抜き・仕込みの担当
  staff_event text,        -- 当日の担当

  -- フライヤーと電源・ガス
  fryer text not null default 'undecided'
    check (fryer in ('gas', 'electric', 'undecided')),
  power text not null default 'unknown'
    check (power in ('yes', 'no', 'unknown')),
  power_note text,         -- 例：1店舗1,500Wまで・500円
  gas_refill boolean not null default false, -- ガスの補充が要るか

  -- お金と注意点
  booth_fee integer,       -- 出店料（円）
  cautions text,           -- その祭り特有の注意点
  contact text,            -- 主催・問い合わせ先
  memo text,

  status text not null default 'planning'
    check (status in ('planning', 'confirmed', 'done')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_plans_event_date_idx on public.event_plans (event_date);

comment on table public.event_plans is
  'イベント・お祭りの段取り表。発注本数・発注日・仕込み担当・フライヤー・電源・注意点を1行で持つ。画面は /events。';

alter table public.event_plans enable row level security;
drop policy if exists "event_plans_all_public" on public.event_plans;
create policy "event_plans_all_public" on public.event_plans
  for all using (true) with check (true);

-- 2026-10-24 追加：鳥の受け取り日と、カレンダーに入れた予定の控え
-- （定期実行「【手羽屋】イベント段取り→カレンダー登録（毎時）」が calendar_event_ids を使う。画面からは書かない）
alter table public.event_plans add column if not exists receive_date date;
alter table public.event_plans add column if not exists calendar_event_ids jsonb not null default '{}'::jsonb;
