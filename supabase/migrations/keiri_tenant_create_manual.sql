-- ============================================================
-- 経理パッケージ：最初の1件を、鍵の貼り直しを待たずに始めるための1枚
-- 作成：2026-09-25（司令室B・kp159）
--
-- ■ 何のための SQL か（やさしい説明）
--   お申し込みが1件決まったとき、ふだんは支払いの通知（Webhook）を受けて
--   「お店1軒ぶんの行」が自動でできます。ところが行を作れるのは
--   サーバー側の合鍵（SUPABASE_SERVICE_ROLE_KEY）だけで、
--   その合鍵はいま壊れています（kp55）。
--   ＝ **いまは、お店1軒ぶんの行を1つも作れません。**
--
--   この1枚は、その行を **手で1つだけ作る** ためのものです。
--   流すと、そのお店の「初回設定のリンク」が1本出てきます。
--   そのリンクをお店にお渡しすれば、お店は
--     ① 店名・数え始めの日・その日の手元の現金を入れる
--     ② 出てきた合言葉で経理の画面に入る
--   まで、こちらの手を借りずに進めます
--   （①②は倉庫の窓口＝keiri_tenant_rpc.sql が代わりにやります。合鍵は要りません）。
--
-- ■ 合鍵が直れば、この1枚は要らなくなります
--   恒久的な直し方は SUPABASE_SERVICE_ROLE_KEY の貼り直し（kp55）です。
--   これは「最初の1件を待たせないため」の回り道で、置き換えではありません。
--
-- ■ 手羽屋には触れません
--   足すのは keiri_tenants の1行だけです。手羽屋は tenant_id を持たない
--   お店として今までどおり動きます。日報・シフト・レジ・LINE・お金の計算とは
--   関係しません。既存の行は1行も書き換えません（追加だけ）。
--
-- ■ 2回流しても2軒にはなりません
--   同じ店名で「初回設定まだ（pending）」の行がすでにあれば、何も足しません
--   （0 rows と出ます）。そのときは下の②で、前に出たリンクを取り直してください。
--
-- 使い方：
--   1. 下の『ここにお店の名前を入れる』を、実際の店名に**2か所とも**書き換える
--   2. Supabase（vtuyebyjbvjmucqpkxug）→ SQL Editor に貼って実行する
--   3. 出てきた setup_url を、そのお店にお渡しする（このリンクは合言葉そのものなので、
--      本人以外に見えるところに貼らない）
-- ============================================================


-- ------------------------------------------------------------
-- ① お店1軒ぶんの行を作り、初回設定のリンクを出す
-- ------------------------------------------------------------
with chars as (
  -- 見間違えない文字だけ（0とO、1とlなどを外してある）。アプリ側と同じ並びです
  select 'abcdefghjkmnpqrstuvwxyz23456789'::text as c
),
token as (
  select string_agg(substr(c, 1 + floor(random() * length(c))::int, 1), '') as t
  from chars, generate_series(1, 32)
)
insert into public.keiri_tenants (shop_name, template, setup_token, source, status)
select
  'ここにお店の名前を入れる',   -- ★1か所目
  'generic',
  token.t,
  'manual',
  'pending'
from token
where not exists (
  select 1 from public.keiri_tenants
  where shop_name = 'ここにお店の名前を入れる'  -- ★2か所目（1か所目と同じ文字にする）
    and status = 'pending'
)
returning
  id,
  shop_name,
  'https://tebaya-report.vercel.app/keiri/welcome?t=' || setup_token as setup_url;


-- ------------------------------------------------------------
-- ② 前に作った行のリンクを取り直すとき（作らずに見るだけ）
-- ------------------------------------------------------------
-- select
--   id,
--   shop_name,
--   status,
--   created_at,
--   'https://tebaya-report.vercel.app/keiri/welcome?t=' || setup_token as setup_url
-- from public.keiri_tenants
-- where status = 'pending'
-- order by created_at desc;


-- ------------------------------------------------------------
-- ③ 作り間違えたとき（まだ初回設定が終わっていない行だけ消せます）
-- ------------------------------------------------------------
-- delete from public.keiri_tenants
-- where shop_name = 'ここにお店の名前を入れる'
--   and status = 'pending';
