-- ============================================================
-- サイトに来た人を数える表（2026-09-18 じゅんの答え c8）
-- ============================================================
-- 5つのサイト（Play Miyazaki・AIツールナビ・煙道ENDO・ビルドナビ・経理パッケージ）が
-- 開かれたときに、サーバー（/api/hit）から1行ずつ足していく表。
--
-- ★ 集めないもの：IPアドレス・ブラウザの種類（UA）・お客さんを見分ける印。
--   保存するのは「どのサイトの・どのページが・いつ開かれたか」だけ。
--
-- ★ 鍵（RLS）：ポリシーを作らない＝サーバーの鍵（service_role）からしか
--   読み書きできない。ブラウザから直接は触れない（table_snapshots と同じ考え方）。
--
-- ★ 手羽屋の日報・シフト・レジ・LINE のテーブルには一切触れていない（追加のみ）。
--
-- 適用方法:
--   Supabase ダッシュボード SQL Editor から実行する（何度実行しても安全）。

create table if not exists public.site_visits (
  id bigserial primary key,

  -- playmiyazaki / ai-tools-navi / endo / mh-build-roadmap / keiri
  site text not null,

  -- 開かれたページ（「?」より後ろは捨ててある）
  path text not null default '/',

  -- SNSなどの合言葉（utm_campaign）。無ければ null
  campaign text,

  -- どこから来たか。**ドメイン名だけ**（例 t.co）。無ければ null
  ref_host text,

  at timestamptz not null default now()
);

comment on table public.site_visits is
  'サイトに来た人の数を数えるための記録。IP・UA・個人を見分ける印は保存しない。';
comment on column public.site_visits.ref_host is
  'どこから来たかのドメイン名だけ。細かいURLは残さない。';

create index if not exists idx_site_visits_at on public.site_visits (at desc);
create index if not exists idx_site_visits_site_at on public.site_visits (site, at desc);
create index if not exists idx_site_visits_campaign
  on public.site_visits (campaign, at desc) where campaign is not null;

-- ブラウザ（anon）からは触らせない。サーバーの鍵だけが読み書きする。
alter table public.site_visits enable row level security;
revoke all on public.site_visits from anon, authenticated;
