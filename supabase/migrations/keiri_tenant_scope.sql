-- ============================================================
-- 日報に「どの店の日報か」の印を足す（経理パッケージ 2店舗目対応・案①）
-- 作成：2026-09-18（司令室B）／じゅん承認：kp35
--
-- ■ 何をする SQL か（やさしい説明）
--   日報の棚（daily_reports）に「どの店のものか」を書く欄を1つ足します。
--   ※ 欄を足すだけです。**いまある日報の中身は1行も書き換えません。**
--
-- ■ 手羽屋はどうなるか
--   手羽屋は「印が空（null）のお店」として、今までどおり動きます。
--   いまある日報はすべて印が空なので、
--   画面が「印が空のものだけ」に絞っても、**見えるものはいまと同じ**です。
--
-- ■ 実行しても安全か
--   何度実行しても同じ結果です（add column if not exists / create or replace）。
--   既存の表・列・決まりは1つも外していません。足しているだけです。
--
-- ■ 反映の順番（大事）
--   **この SQL を先に実行してから、アプリを本番に出してください。**
--   逆にすると、アプリが「まだ無い欄」を読みに行って
--   手羽屋の画面が一時的にエラーになります。
-- ============================================================

-- ------------------------------------------------------------------
-- 1. 日報に「どの店か」の印を足す
--    空（null）＝ 手羽屋。値が入っていれば、経理パッケージを申し込んだお店。
-- ------------------------------------------------------------------
alter table public.daily_reports
  add column if not exists tenant_id uuid references public.keiri_tenants (id);

comment on column public.daily_reports.tenant_id is
  'どの店の日報か。空（null）＝手羽屋。値＝keiri_tenants.id。既存の行はすべて空のまま。';

-- 「そのお店の、その期間ぶん」を素早く引けるようにする（速さのためだけ・意味は変えない）
create index if not exists daily_reports_tenant_date_idx
  on public.daily_reports (tenant_id, date);

-- ------------------------------------------------------------------
-- 2. 経理画面が読むビューにも、その印を出す
--
--    keiri_reports は「レシート写真を抜いた軽い日報」の見え方です
--    （CLAUDE.md 4-2）。元の daily_reports は1文字も変わりません。
--    列を1つ増やすだけなので、いまの画面の読み取りは壊れません。
-- ------------------------------------------------------------------
create or replace view keiri_reports
with (security_invoker = true) as
select
  r.id,
  r.date,
  r.location,
  r.staff_name,
  r.shop,
  r.sales_amount,
  r.labor,
  coalesce(
    (
      select jsonb_agg(x - 'receipt_image_url')
      from jsonb_array_elements(
        case when jsonb_typeof(r.expenses) = 'array' then r.expenses else '[]'::jsonb end
      ) as x
    ),
    '[]'::jsonb
  ) as expenses,
  -- ※ 新しい欄は必ず「いちばん後ろ」に足すこと。
  --    途中に差し込むと、データベースが「いまある列の名前を勝手に変えるな」と断る
  --    （2026-09-18 に実測でエラー 42P16。画面は列の名前で読むので後ろで問題ない）。
  r.tenant_id
from daily_reports r;

-- ------------------------------------------------------------------
-- 3. 確かめ方（実行後に貼ると、手羽屋の行が1つも動いていないことが分かる）
--
--   select count(*) as 全部, count(tenant_id) as 印がついている行
--   from public.daily_reports;
--
--   → 「印がついている行」が 0 なら、手羽屋のデータは今までどおりです。
-- ------------------------------------------------------------------
