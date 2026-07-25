-- 日報にお店区分・お酒本数・もも屋の動的商品本数を追加
alter table public.daily_reports
  add column if not exists shop text not null default '手羽屋',
  add column if not exists alcohol_count integer not null default 0,
  add column if not exists product_counts jsonb not null default '{}'::jsonb;

comment on column public.daily_reports.shop is 'お店区分（手羽屋 / もも屋）';
comment on column public.daily_reports.alcohol_count is 'お酒の本数（記録のみ・売上計算に影響なし）';
comment on column public.daily_reports.product_counts is 'もも屋等の商品マスタ連動の本数 {商品名: 本数}（主力の逆算本数も含む）';
