-- ------------------------------------------------------------------
-- お申し込みの控えが「お名前・メールが空でも残る」ようにする
-- （2026-10-04・司令室B・f2-1 / f2-3）
--
-- ■ 何が起きているか（やさしい説明）
--   2026-10-01（kp207）に、お申し込みで必ず入れていただくのを
--   **「お店の名前」と「電話番号」の2つだけ**に減らしました。
--   出店説明会の立ち話でスマホに4つ打つのは重すぎるためです。
--   お名前とメールアドレスは、空でも申し込みが通ります。
--
--   ところが**棚（keiri_applications）の受け入れの決まりだけが、古いまま**でした。
--   いまの決まりは
--       length(contact_name) between 1 and 120
--       length(email)        between 1 and 254
--   になっており、**空（長さ0）だと断られます**。
--   受け口のコードは、入っていない所を「空の文字」で入れに行くので、
--   **お名前かメールを入れずに申し込んだ方の控えは、1行も残りません。**
--
--   いまサーバー側の鍵（SUPABASE_SERVICE_ROLE_KEY）が壊れているため、
--   控えはブラウザと同じ権利（anon）で入れています。
--   つまりこの決まりに当たったら、そこで終わりです。
--   スタッフのLINEへの知らせは飛ぶので申し込み自体は気づけますが、
--   **あとから一覧で見返せる控えがどこにも残りません。**
--
-- ■ この SQL が変えること（1か所だけ）
--   お名前とメールの「長さの下限」を 1 → 0 にします。上限は変えません。
--   ほかの条件（source='form' / status='new' / tenant_id is null /
--   お店の名前と電話の長さ）は**1文字も変えません**。
--   ＝ いたずらで変な行を増やされない守りは、そのまま残ります。
--
-- ■ 何度流しても同じ結果です（drop policy if exists → create policy）。
-- ■ 既存の行には触りません（決まりを書き換えるだけ）。
-- ------------------------------------------------------------------

drop policy if exists "keiri_applications_insert_only" on public.keiri_applications;
create policy "keiri_applications_insert_only"
  on public.keiri_applications
  for insert
  to anon, authenticated
  with check (
    -- サイトのフォームから来た・まだ折り返していない・お店に繋がっていない申し込みだけ
    source = 'form'
    and status = 'new'
    and tenant_id is null
    -- 長さの上限（フォームの入力欄と同じ上限）
    and length(shop_name) between 1 and 120
    -- ★ここだけ変更：お名前とメールは空でもよい（下限 1 → 0。上限は変えない）
    and length(contact_name) between 0 and 120
    and length(email) between 0 and 254
    -- ↓ここから下は、もとの決まり（keiri_applications_insert_only.sql）と1文字も変えていません
    and (phone is null or length(phone) <= 40)
    and (note is null or length(note) <= 2000)
    -- 時刻は既定（now()）のまま。過去や未来を勝手に入れさせない
    and created_at between now() - interval '5 minutes' and now() + interval '5 minutes'
  );

-- ------------------------------------------------------------------
-- 確かめ方（流したあとに貼ると、決まりが入れ替わったことが分かります）
--
--   select policyname, with_check
--     from pg_policies
--    where tablename = 'keiri_applications'
--      and policyname = 'keiri_applications_insert_only';
--   → with_check の中に「length(email) >= 0」の形が出ます。
--
--   select count(*) as 申し込みの件数 from public.keiri_applications;
--   → 流す前と変わりません（この SQL は行を触っていないため）。
-- ------------------------------------------------------------------
