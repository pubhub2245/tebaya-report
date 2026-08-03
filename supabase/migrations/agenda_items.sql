-- ミーティング議題（アジェンダ）募集。従業員が「話したいこと」をメモ感覚で追加し、
-- ミーティング時にみんなで確認しながら進める。意見箱と近いオープンな運用。
create table if not exists public.agenda_items (
  id uuid primary key default gen_random_uuid(),
  submitter text not null,
  title text not null,
  detail text,
  category text not null default 'other'
    check (category in ('share','consult','improve','problem','other')),
  status text not null default 'open'
    check (status in ('open','done')),
  decision text,
  status_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.agenda_items is 'ミーティング議題（アジェンダ）募集。従業員が話したいことを登録し、ミーティングで確認・完了にする。';

grant select, insert, update, delete on public.agenda_items to anon, authenticated;
create index if not exists idx_agenda_status on public.agenda_items (status, created_at desc);
