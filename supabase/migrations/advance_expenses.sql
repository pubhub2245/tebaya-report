-- 立替・精算記録（日報の立替経費とは別枠）
-- 立替者を記録し、精算（返金）で手元現金に反映する運用用テーブル
create table if not exists public.advance_expenses (
  id bigint generated always as identity primary key,
  date date not null,                 -- 立替日
  payer text not null,                -- 立替者（緒方 / 川畑 / その他名前）
  amount integer not null default 0,  -- 立替金額
  description text,                   -- 用途
  receipt_image_url text,             -- レシート画像（任意・データURL）
  settled boolean not null default false,   -- 精算（返金）済みか
  settled_date date,                  -- 精算日
  memo text,
  created_at timestamptz not null default now(),
  created_by text
);

comment on table public.advance_expenses is '立替・精算記録。手元現金には精算(settled=true)時点で反映する運用。';

-- 既存テーブル(daily_reports / cash_settings)と同様、anonクライアントから利用する
grant select, insert, update, delete on public.advance_expenses to anon, authenticated;

create index if not exists idx_advance_expenses_settled on public.advance_expenses (settled);
create index if not exists idx_advance_expenses_date on public.advance_expenses (date);
