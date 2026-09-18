-- ============================================================
-- 選択肢の棚（出店場所・担当者・商品）にも「どの店のものか」の印を足す
-- 作成：2026-09-19（司令室B）／kp42
--
-- ■ 何をする SQL か（やさしい説明）
--   日報で選ぶ「出店場所」「担当者」「商品と単価」の一覧に、
--   「どの店のものか」を書く欄を1つずつ足します。
--   ※ 欄を足すだけです。**いまある行の中身は1行も書き換えません。**
--
-- ■ 手羽屋はどうなるか
--   手羽屋は「印が空（null）のお店」として、今までどおり動きます。
--   いまある出店場所・担当者・商品はすべて印が空なので、
--   画面が「印が空のものだけ」に絞っても、**見えるものはいまと同じ**です。
--
-- ■ なぜ要るのか
--   経理パッケージを申し込んだお店が日報を打つと、
--   いまは「ながやま三股」「イデ」「手羽先」から選ぶことになり、実際には使えません。
--   逆に、そのお店が自分の場所や商品を足すと、
--   手羽屋の日報の選択肢にもそれが並んでしまいます。
--
-- ■ 実行しても安全か
--   何度実行しても同じ結果です（add column if not exists）。
--   既存の表・列・決まりは1つも外していません。足しているだけです。
--
-- ■ 反映の順番（大事）
--   **この SQL を先に実行してから、アプリを本番に出してください。**
--   逆にすると、アプリが「まだ無い欄」を読みに行って
--   手羽屋の画面が一時的にエラーになります。
--
--   ※ 先に keiri_tenants の表が要ります（2026-09-18 に作成ずみ）。
-- ============================================================

-- 出店場所（日報の「出店場所」の選択肢）
alter table public.locations
  add column if not exists tenant_id uuid references public.keiri_tenants (id);
comment on column public.locations.tenant_id is
  'どの店の出店場所か。空（null）＝手羽屋。値＝keiri_tenants.id。既存の行はすべて空のまま。';
create index if not exists locations_tenant_idx
  on public.locations (tenant_id);

-- 担当者（日報の「担当者」の選択肢・日当）
alter table public.staff_members
  add column if not exists tenant_id uuid references public.keiri_tenants (id);
comment on column public.staff_members.tenant_id is
  'どの店の担当者か。空（null）＝手羽屋。値＝keiri_tenants.id。既存の行はすべて空のまま。';
create index if not exists staff_members_tenant_idx
  on public.staff_members (tenant_id);

-- 商品と単価（日報 STEP4 の内訳チェックに使う）
alter table public.sale_products
  add column if not exists tenant_id uuid references public.keiri_tenants (id);
comment on column public.sale_products.tenant_id is
  'どの店の商品か。空（null）＝手羽屋。値＝keiri_tenants.id。既存の行はすべて空のまま。';
create index if not exists sale_products_tenant_idx
  on public.sale_products (tenant_id);

-- ------------------------------------------------------------------
-- 確かめ方（実行後に貼ると、手羽屋の行が1つも動いていないことが分かる）
--
--   select 'locations' as 棚, count(*) as 全部, count(tenant_id) as 印がついている行
--   from public.locations
--   union all select 'staff_members', count(*), count(tenant_id) from public.staff_members
--   union all select 'sale_products', count(*), count(tenant_id) from public.sale_products;
--
--   → 「印がついている行」がどれも 0 なら、手羽屋のデータは今までどおりです。
-- ------------------------------------------------------------------
