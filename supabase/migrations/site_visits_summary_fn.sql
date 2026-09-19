-- ============================================================
-- 訪問の「数」だけを返す窓口（2026-09-19・kp84 の続き）
-- ============================================================
-- ■ いまどうなっているか
--   訪問の棚（site_visits）は 9/19 14:04 に「**入れることだけ許す**」形にした。
--   おかげで訪問は記録され始めたが、**読む許可が無いので誰も数を見られない**。
--   実際、本番の /api/hit/summary はいま
--   「まだ数えられません。表はありますが、読む許可がありません」と返る。
--   ＝ 訪問の 0 が「誰も来ていない」なのか「数えられていない」なのか、
--      まだ区別できないままになっている。
--
-- ■ この SQL が何をするか（やさしい説明）
--   棚そのものは**郵便ポストのまま**（1行ずつは読めないまま）にして、
--   「**どのサイトが・どの日に・何回開かれたか**」という**数だけ**を答える
--   小さな窓口を1つ作る。ページ名（path）・来た元（ref_host）は返さない。
--   ＝ 中身は見えないまま、数だけ数えられるようになる。
--
-- ■ 安全のためにしていること
--   ・返すのは site / day / hits の3つだけ（**1行ずつの記録は出さない**）
--   ・見に行ける日数に上限を付ける（1〜400日）
--   ・棚の作り・いまの決まり（入れることだけ許す）は**1つも変えない**
--   ・手羽屋の日報・シフト・レジ・LINE の表には一切触れない（追加のみ）
--   ・何度実行しても同じ結果（create or replace）
--
-- 適用方法:
--   Supabase ダッシュボード（vtuyebyjbvjmucqpkxug）の SQL Editor で実行する。

create or replace function public.site_visits_summary(days integer default 70)
returns table (site text, day date, hits bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.site,
    ((v.at at time zone 'Asia/Tokyo')::date) as day,
    count(*)::bigint as hits
  from public.site_visits v
  where v.at >= now() - (least(greatest(coalesce(days, 70), 1), 400) || ' days')::interval
  group by 1, 2
  order by 2 desc, 1 asc
$$;

comment on function public.site_visits_summary(integer) is
  '訪問の「数」だけを返す窓口。site / day / hits だけを返し、ページ名や来た元は返さない。棚は入れる専用のまま。';

-- 誰でも呼べる状態にはしない。アプリ（通常の鍵）からだけ呼べるようにする。
revoke all on function public.site_visits_summary(integer) from public;
grant execute on function public.site_visits_summary(integer) to anon, authenticated, service_role;

-- 実行後の確かめ方（どちらも「数」しか出ない）:
--   select * from public.site_visits_summary(7);
--   select site, sum(hits) from public.site_visits_summary(7) group by 1;
-- 1行ずつは読めないままであることの確かめ（エラーになれば正しい）:
--   set role anon; select * from public.site_visits limit 1; reset role;

-- 元に戻したいとき（1行）:
--   drop function if exists public.site_visits_summary(integer);
