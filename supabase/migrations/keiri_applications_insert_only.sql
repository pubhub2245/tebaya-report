-- ============================================================
-- 申し込みの棚（keiri_applications）を「入れることだけ許す」ポストにする
--   2026-09-19 実行：A（Supabase の SQL Editor から手で流した）
--   2026-09-19 記録：B（kp89）／流した中身を倉庫に書き写したもの
-- ============================================================
--
-- ■ このファイルは「あとから書いた控え」です
--   本番には 9/19 15:05 に A が手で流して**すでに入っています**。
--   倉庫にファイルが無いままだと、倉庫を作り直したときにこの決まりが消え、
--   申し込みの控えが黙って残らなくなります。それを防ぐための記録です。
--   **本番とこのファイルが食い違っていたら、このファイルを流して本番を寄せてください**
--   （何度流しても同じ結果になります）。
--
-- ■ これが何をするか（やさしい説明）
--   いま keiri_applications は鍵（RLS）が掛かっていて決まりが1つも無いため、
--   **サーバー側の合鍵（壊れている・kp55）以外は1行も書けません**。
--   ＝申し込みが入っても、名前も連絡先も残らずに消えていました。
--   ここでは「**入れることだけ**許す」決まりを1つ足します。
--   読み出し（select）・書き換え（update）・消す（delete）は**許しません**。
--   ＝入れた中身を外から見ることはできない、郵便ポストの形です。
--
-- ■ 連絡先が入る棚なので、条件をきつくしてあります
--   入れてよいのは「サイトのフォームから来た・まだ折り返していない・
--   どのお店にも繋がっていない」申し込みだけ。長さの上限と、時刻の縛りつき。
--
-- ■ これは鍵が壊れているあいだの回り道です
--   Vercel の SUPABASE_SERVICE_ROLE_KEY（kp55）が直ったら、
--   いちばん下の「戻し方」で落としてください（kp88）。
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

-- 入れるのに要る権限だけを渡す（読み出しの権限は渡さない）
grant insert on table public.keiri_applications to anon, authenticated;

-- いたずらで変な行を増やされないように、入れてよい中身を絞る
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
    and length(contact_name) between 1 and 120
    and length(email) between 1 and 254
    and (phone is null or length(phone) <= 40)
    and (note is null or length(note) <= 2000)
    -- 時刻は既定（now()）のまま。過去や未来を勝手に入れさせない
    and created_at between now() - interval '5 minutes' and now() + interval '5 minutes'
  );

-- ------------------------------------------------------------
-- 確かめ方（実行後に1回だけ）
--
--   select polname from pg_policy
--    where polrelid = 'public.keiri_applications'::regclass;
--   -- → keiri_applications_insert_only が1つだけ出る
--
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name = 'keiri_applications' and grantee in ('anon','authenticated');
--   -- → INSERT だけが並ぶ
--   --   （SELECT / UPDATE / DELETE / TRUNCATE が出たらおかしい）
--
-- ------------------------------------------------------------
-- 戻し方（鍵 kp55 が直ったら・kp88）
--
--   drop policy if exists "keiri_applications_insert_only" on public.keiri_applications;
--   revoke insert on table public.keiri_applications from anon, authenticated;
--
-- ============================================================
