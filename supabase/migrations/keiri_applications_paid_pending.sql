-- ============================================================
-- 支払いのリンクで先に払われた方の控えを、鍵が直る前でも残せるようにする
--   作成：2026-09-19（司令室B）／kp95
-- ============================================================
--
-- ■ これが何をするか（やさしい説明）
--   申し込みの棚（keiri_applications）は 9/19 15:05 に
--   「**入れることだけ許す郵便ポスト**」にしてもらいました（keiri_applications_insert_only.sql）。
--   ただし入れてよいのは **サイトのフォームから来た申し込み（source='form'）だけ**です。
--
--   いっぽう、Stripe の支払いリンクで**先にお金を払った方**が
--   初回設定の画面（/keiri/welcome?session=…）を開いたとき、
--   お店の行がまだ無いので**そのままでは行き止まり**になります。
--   そこでアプリ側（kp95）で
--     ・画面を「お手続きを確認しています。担当からすぐにご連絡します」に変え
--     ・スタッフの LINE へ知らせ
--     ・控えに1行残す（source='paid_pending'）
--   ようにしました。**この3つ目だけが、いまの決まりでは入りません。**
--   ここでは `source='paid_pending'` の行を入れる決まりを**もう1つ足します**。
--
-- ■ 足すだけ・今の決まりは1文字も触りません
--   Postgres の決まり（ポリシー）は**どれか1つ通れば入る**ので、
--   いまの `keiri_applications_insert_only` はそのまま残します。
--   ＝ すでに動いているフォームの受け付けが、この直しで悪くなることはありません。
--
-- ■ お名前とメールは「（未確認）」で入ります
--   この場面では分からないためです。**作り物の連絡先は入れません。**
--   どなたが払ったかは、控えの note に入る「お支払い画面の番号」から
--   Stripe の画面で引けます。
--
-- ■ いたずら対策（form のときと同じ考え方）
--   読み出し・書き換え・削除は**許しません**（権利そのものが渡っていません）。
--   長さの上限つき／時刻は「いまから前後5分」だけ。
--
-- ■ これは鍵が壊れているあいだの回り道です
--   Vercel の SUPABASE_SERVICE_ROLE_KEY（kp55）が直ったら、
--   いちばん下の「戻し方」で落としてください（kp88 と同じタイミング）。
--
-- ■ 手羽屋の日報・シフト・レジ・LINE・お金の計算には一切触れていません。
-- ■ 何度実行しても同じ結果になります。
-- ------------------------------------------------------------

alter table public.keiri_applications enable row level security;

-- ★ここが 2026-09-19 19:05 に実際に空いていた穴です（kp97）。
--   Supabase は新しく作った表に「anon・authenticated が使ってよい」既定の権利を自動で付けます。
--   そこには TRUNCATE（表をまるごと空にする）も入っていて、
--   **外から来た人が申し込みを全部消せる状態**でした（A が本番で取り上げました）。
--   下の grant は INSERT を足すだけなので、この行が無いと**流し直すたびに黙って戻ります**。
--   ＝ 申し込みの受け付けには影響しません（入れることは今までどおりできます）。
revoke truncate, references, trigger on table public.keiri_applications from anon, authenticated;

-- 入れるのに要る権限だけを渡す（すでに渡っていれば何も変わらない）
grant insert on table public.keiri_applications to anon, authenticated;

drop policy if exists "keiri_applications_insert_paid_pending" on public.keiri_applications;
create policy "keiri_applications_insert_paid_pending"
  on public.keiri_applications
  for insert
  to anon, authenticated
  with check (
    -- 先に支払いが済んだ方・まだ折り返していない・お店に繋がっていない行だけ
    source = 'paid_pending'
    and status = 'new'
    and tenant_id is null
    -- 長さの上限
    and length(shop_name) between 1 and 120
    and length(contact_name) between 1 and 120
    and length(email) between 1 and 254
    and phone is null
    and length(note) between 1 and 2000
    -- 時刻は既定（now()）のまま。過去や未来を勝手に入れさせない
    and created_at between now() - interval '5 minutes' and now() + interval '5 minutes'
  );

-- ------------------------------------------------------------
-- 確かめ方（実行後に1回だけ）
--
--   select polname from pg_policy
--    where polrelid = 'public.keiri_applications'::regclass;
--   -- → keiri_applications_insert_only と
--   --    keiri_applications_insert_paid_pending の2つが出る
--
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name = 'keiri_applications' and grantee in ('anon','authenticated');
--   -- → INSERT だけが並ぶ
--   --   （SELECT / UPDATE / DELETE / TRUNCATE が出たらおかしい）
--
--   -- 外から来る人（anon）になりきって1行入れてみる → 入る／読めない
--   -- 確かめに使った行は消してください（運営の鍵からなら消せます）
--
-- ------------------------------------------------------------
-- 戻し方（鍵 kp55 が直ったら・kp88 と同時に）
--
--   drop policy if exists "keiri_applications_insert_paid_pending" on public.keiri_applications;
--
-- ============================================================
