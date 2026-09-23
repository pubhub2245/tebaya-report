-- ============================================================
-- お申し込みの「数」だけを返す窓口（2026-09-24・kp124）
-- ============================================================
-- ■ いまどうなっているか（なぜ要るのか）
--   申し込みの棚（keiri_applications）は 9/19 に
--   「**入れることだけ許す郵便ポスト**」の形にした（keiri_applications_insert_only.sql）。
--   おかげで申し込みは控えとして残るようになったが、
--   **読む許可が無いので、入った件数を誰も見られない**。
--   サーバー側の合鍵（SUPABASE_SERVICE_ROLE_KEY）も壊れたまま（kp55）。
--   ＝ いま申し込みが1件入っても、気づけるのは LINE の知らせ1本だけで、
--      それを見落とすと **最初の1件を取りこぼす**。
--
--   訪問（site_visits）で 9/19 に作ったのと **まったく同じ形**の窓口を、
--   申し込みにも1つ作る。
--
-- ■ この SQL が何をするか（やさしい説明）
--   棚そのものは**郵便ポストのまま**（1行ずつは読めないまま）にして、
--   「**まだ手当てしていない申し込みが何件あるか**」という**数だけ**を答える
--   小さな窓口を1つ作る。
--   お店の名前・お名前・メール・電話・メモは **1文字も返さない**。
--
-- ■ 返すもの（この5つだけ。連絡先は入らない）
--   pending    … まだ手当てしていない件数（status = 'new'）
--   total      … これまでに入った全件数
--   latest_at  … いちばん新しい申し込みが入った時刻
--   pending_form         … そのうちサイトのフォームから来たもの
--   pending_paid_pending … そのうち先に支払いだけ済んだもの
--
-- ■ 安全のためにしていること
--   ・返すのは**数と時刻だけ**（1行ずつの記録・連絡先は出さない）
--   ・棚の作り・いまの決まり（入れることだけ許す）は**1つも変えない**
--   ・手羽屋の日報・シフト・レジ・LINE・お金の計算には一切触れない（追加のみ）
--   ・何度実行しても同じ結果（create or replace）
--
-- 適用方法:
--   Supabase ダッシュボード（vtuyebyjbvjmucqpkxug）の SQL Editor で1回実行する。
--   ※ 実行しなくてもアプリは壊れません。窓口が無いあいだは診断が
--      「まだ数えられません（窓口がありません）」と正直に出すだけです。
-- ============================================================

create or replace function public.keiri_applications_summary()
returns table (
  pending bigint,
  total bigint,
  latest_at timestamptz,
  pending_form bigint,
  pending_paid_pending bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (where a.status = 'new')::bigint                                as pending,
    count(*)::bigint                                                                as total,
    max(a.created_at)                                                               as latest_at,
    count(*) filter (where a.status = 'new' and a.source = 'form')::bigint          as pending_form,
    count(*) filter (where a.status = 'new' and a.source = 'paid_pending')::bigint  as pending_paid_pending
  from public.keiri_applications a
$$;

comment on function public.keiri_applications_summary() is
  'お申し込みの「数」だけを返す窓口。件数と最新時刻だけを返し、お店の名前・連絡先は返さない。棚は入れる専用のまま。';

-- 誰でも呼べる状態にはしない。アプリ（通常の鍵）からだけ呼べるようにする。
revoke all on function public.keiri_applications_summary() from public;
grant execute on function public.keiri_applications_summary() to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 実行後の確かめ方（どちらも「数」しか出ない）:
--   select * from public.keiri_applications_summary();
--   -- → pending / total / latest_at / pending_form / pending_paid_pending が1行
--
-- 1行ずつは読めないままであることの確かめ（エラーになれば正しい）:
--   set role anon; select * from public.keiri_applications limit 1; reset role;
--
-- 元に戻したいとき（1行）:
--   drop function if exists public.keiri_applications_summary();
-- ============================================================
