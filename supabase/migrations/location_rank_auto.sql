-- ============================================================
-- 出店先ランクを「直近の実績」で自動判定できるようにする
-- ============================================================
-- ■ なぜ必要か
--   ランクが2種類あって、画面によって違う値が出ていた。
--     ① 出店場所マスタ（locations.rank）… 手で決めた等級。目標額の元
--     ② 売上分析のバッジ               … 平均売上から画面が勝手に出していた評価
--   同じ画面に「目標 ¥30,000（D）」と「B」が並んで混乱していた。
--   これからは **マスタのランクだけが正**。直近8回の実績から自動で判定して
--   マスタ（rank / target）を書き換える。判定のルールは lib/locationRank.ts。
--
-- ■ ここでやること（追加だけ。既存の行や列は消さない）
--   1) locations に rank_locked（自動判定しない印）を足す
--   2) location_rank_history（ランクが変わった記録）を作る
--   3) 「都城イベント」だけ rank_locked を ON にする
--      （お祭り・イベント枠は毎回別の会場なので、平均で判定すると意味が無いため）

-- 1) 「固定」フラグ。ON にすると自動判定の対象から外れる
alter table public.locations
  add column if not exists rank_locked boolean not null default false;

comment on column public.locations.rank_locked is
  'true のときランクの自動判定をしない（お祭り・イベント枠など）。管理者ページの出店場所マスタで切り替える。';

-- 2) ランク履歴。「いつ・どの場所が・何から何に・どんな実績で」変わったかを残す
create table if not exists public.location_rank_history (
  id bigint generated always as identity primary key,
  location_id integer not null references public.locations (id) on delete cascade,
  old_rank text,
  new_rank text,
  avg_sales integer,
  sample_count integer,
  changed_at timestamptz not null default now()
);

comment on table public.location_rank_history is
  '出店先ランクの変更履歴。直近8回の平均売上から自動判定してランクが変わったときに1行増える。';

create index if not exists idx_location_rank_history_loc
  on public.location_rank_history (location_id, changed_at desc);

grant select, insert on public.location_rank_history to anon, authenticated;

-- RLS（テーブルの鍵）。既存テーブルと同じ「全員OK」の内容にそろえる（→ CLAUDE.md 4-8）
alter table public.location_rank_history enable row level security;
drop policy if exists location_rank_history_all_public on public.location_rank_history;
create policy location_rank_history_all_public
  on public.location_rank_history for all using (true) with check (true);

-- 3) 「都城イベント」は自動判定しない（毎回ちがう会場のため）
update public.locations set rank_locked = true where name = '都城イベント';
