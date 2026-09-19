-- ============================================================
-- 経理パッケージ：払ったお店が「人の手を借りずに使い始められる」ようにする窓口
-- 作成：2026-09-19（司令室B・kp93）
--
-- ■ 何のための SQL か（やさしい説明）
--   申し込んだお店は、お金を払ったあと次の2つをします。
--     ① 初回設定（お店の名前・数え始めの日・その日の手元の現金を入れる）
--     ② 出てきた合言葉で、経理の画面に入る
--   いまはこの2つが **必ず失敗します**。お店の置き場（keiri_tenants）に鍵が掛かっていて、
--   サーバー側の合鍵（SUPABASE_SERVICE_ROLE_KEY）でしか触れないのに、
--   その合鍵が壊れているためです（kp55）。
--
--   そこで、棚そのものは **鍵を掛けたまま** にして、
--   「この2つの用事だけを代わりにやってくれる、小さな窓口」を2つ作ります。
--   訪問の数を数える窓口（site_visits_summary）と まったく同じ作りです。
--
-- ■ 棚の中身は1行も見えません
--   窓口が返すのは、用事の結果だけです。
--     ・初回設定 … うまくいったか／リンクが違うか／もう終わっているか
--     ・合言葉   … 合ったお店の番号と店名だけ（合わなければ何も返らない）
--   お店の一覧・合言葉・支払いの番号は、どの窓口からも出てきません。
--   窓口を呼ぶには「32文字の初回設定の合言葉」か「管理画面の合言葉」が要ります。
--   ＝ 持っている本人にしか使えません。
--
-- ■ 手羽屋には触れません
--   さわる表は keiri_tenants と keiri_settings（そのお店ぶんの1行）だけです。
--   手羽屋の設定は tenant_id が空の行で、この窓口からは絶対に当たりません
--   （tenant_id が必ず入る形でしか書き込まないため）。
--   日報・シフト・レジ・LINE・お金の計算には一切関係しません。
--
-- ■ 何度実行しても同じ結果です（create or replace）。
-- ■ 元に戻すのは一番下の3行です。
--
-- 適用方法：Supabase（vtuyebyjbvjmucqpkxug）→ SQL Editor に
--           このファイルの中身を **そのまま** 貼って実行する。
-- ============================================================


-- ------------------------------------------------------------
-- ① 初回設定をすませる窓口
--
--   受け取る：初回設定の合言葉（または支払いの番号）、店名、数え始めの日、
--             その日の手元の現金、管理画面の合言葉を戻せない形にしたもの
--   返す    ：outcome … 'ok'（できた）／'not_found'（リンクが違う）／
--                       'already'（もう終わっている）
--             tenant_id … できたお店の番号（'ok' のときだけ）
--             settings_ok … 数え始めの日と手元の現金まで入ったか
--
--   ★ 合言葉は「戻せない形（ハッシュ・64文字）」で受け取ります。
--     生の合言葉はこの窓口を通りません（アプリ側で変換してから渡します）。
-- ------------------------------------------------------------
create or replace function public.keiri_tenant_activate(
  p_token text,
  p_session text,
  p_shop_name text,
  p_opening_date date,
  p_opening_balance numeric,
  p_admin_password_hash text
)
returns table (outcome text, tenant_id uuid, settings_ok boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_status text;
  v_token text := nullif(btrim(coalesce(p_token, '')), '');
  v_session text := nullif(btrim(coalesce(p_session, '')), '');
  v_name text := left(btrim(coalesce(p_shop_name, '')), 60);
  v_settings_ok boolean := false;
begin
  -- 合言葉は必ず「戻せない形（sha256 の16進64文字）」であること
  if p_admin_password_hash is null or p_admin_password_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'admin_password_hash の形が違います';
  end if;
  if v_name = '' then
    raise exception 'お店の名前が空です';
  end if;
  if p_opening_date is null or p_opening_balance is null then
    raise exception '数え始めの日と手元の現金が要ります';
  end if;

  -- 初回設定の合言葉は32文字。短すぎるものは当てずに断る（総当たり対策）
  if v_token is not null and length(v_token) < 16 then
    v_token := null;
  end if;
  if v_session is not null and length(v_session) < 8 then
    v_session := null;
  end if;
  if v_token is null and v_session is null then
    outcome := 'not_found';
    return next;
    return;
  end if;

  -- どのお店かを1軒だけ引く（合言葉が先。無ければ支払いの番号）
  select t.id, t.status
    into v_id, v_status
    from public.keiri_tenants t
   where (v_token is not null and t.setup_token = v_token)
      or (v_token is null and v_session is not null and t.external_session_id = v_session)
   limit 1;

  if v_id is null then
    outcome := 'not_found';
    return next;
    return;
  end if;

  if v_status is distinct from 'pending' then
    outcome := 'already';
    return next;
    return;
  end if;

  -- 2回押されても2回目は当たらない（すでに pending ではなくなるため）
  update public.keiri_tenants t
     set shop_name = v_name,
         admin_password_hash = p_admin_password_hash,
         status = 'active',
         activated_at = now()
   where t.id = v_id
     and t.status = 'pending';

  if not found then
    outcome := 'already';
    return next;
    return;
  end if;

  -- そのお店ぶんの設定を1行作る。
  -- ★ business_type_code を付けないと既定値の 'tebaya'（手羽屋）になり、
  --   手羽屋の行とぶつかって1行も作れません（入れた数字が黙って消えます）。
  begin
    insert into public.keiri_settings (
      tenant_id, business_type_code, opening_date, opening_balance,
      outsourcing_rate, monthly_rent, rent_start_month
    ) values (
      v_id, 't_' || lower(v_id::text), p_opening_date, p_opening_balance,
      0, 0, to_char(p_opening_date, 'YYYY-MM')
    );
    v_settings_ok := true;
  exception when others then
    -- 設定の行だけ作れなくても、お店の行はできているので日報は打てる。
    -- ここで止めない（アプリ側と同じ考え方）。
    v_settings_ok := false;
  end;

  outcome := 'ok';
  tenant_id := v_id;
  settings_ok := v_settings_ok;
  return next;
end;
$$;

comment on function public.keiri_tenant_activate(text, text, text, date, numeric, text) is
  '経理パッケージの初回設定だけを代わりに行う窓口。棚の中身は返さない（2026-09-19・kp93）';


-- ------------------------------------------------------------
-- ② 合言葉を確かめる窓口
--
--   受け取る：管理画面の合言葉を戻せない形にしたもの（64文字）
--   返す    ：合ったお店の番号と店名だけ。合わなければ0行。
--   ★ 合言葉そのもの・ハッシュ・他のお店のことは返しません。
-- ------------------------------------------------------------
create or replace function public.keiri_tenant_login(p_password_hash text)
returns table (tenant_id uuid, shop_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.id, t.shop_name
    from public.keiri_tenants t
   where p_password_hash ~ '^[0-9a-f]{64}$'
     and t.admin_password_hash = p_password_hash
     and t.status = 'active'
   limit 1;
$$;

comment on function public.keiri_tenant_login(text) is
  '経理パッケージの合言葉の確認だけを行う窓口。合ったお店の番号と店名しか返さない（2026-09-19・kp93）';


-- ------------------------------------------------------------
-- ③ 申し込み1件を手で作るための道具（運営だけが使う）
--
--   Stripe の知らせ先（Webhook）がまだ繋がっていないあいだ、
--   最初の1軒は SQL Editor から手で1行作って、出てきた初回設定のリンクを
--   お店にお渡しします。
--   ★ これは anon（外から来る人）には **渡しません**。
--     SQL Editor から運営が呼ぶときだけ使えます。
--
--   使い方：
--     select * from public.keiri_tenant_create_manual('お店の名前');
--   返ってくる setup_path を、本番のURLの後ろに付けてお店に渡します。
--     例 https://tebaya-report.vercel.app/keiri/welcome?t=xxxxxxxx
-- ------------------------------------------------------------
create or replace function public.keiri_tenant_create_manual(
  p_shop_name text default null,
  p_template text default 'generic'
)
returns table (tenant_id uuid, setup_token text, setup_path text)
language plpgsql
as $$
declare
  v_token text := '';
  v_chars text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_id uuid;
  i int;
begin
  -- 見間違えない文字だけで32文字（アプリ側の readableSecret と同じ文字集合）
  for i in 1..32 loop
    v_token := v_token || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
  end loop;

  insert into public.keiri_tenants (shop_name, template, setup_token, source, status)
  values (nullif(left(btrim(coalesce(p_shop_name, '')), 60), ''),
          coalesce(nullif(btrim(p_template), ''), 'generic'),
          v_token, 'manual', 'pending')
  returning id into v_id;

  tenant_id := v_id;
  setup_token := v_token;
  setup_path := '/keiri/welcome?t=' || v_token;
  return next;
end;
$$;

comment on function public.keiri_tenant_create_manual(text, text) is
  '申し込み1件を手で作る道具（運営のみ。anon には渡さない）（2026-09-19・kp93）';


-- ------------------------------------------------------------
-- 誰が呼べるかを、はっきり決める
--
--   PostgreSQL は関数を作ると既定で「誰でも呼べる」状態になるので、
--   まず全部取り上げてから、必要なものだけ渡します。
-- ------------------------------------------------------------
revoke all on function public.keiri_tenant_activate(text, text, text, date, numeric, text) from public;
revoke all on function public.keiri_tenant_login(text) from public;
revoke all on function public.keiri_tenant_create_manual(text, text) from public;

grant execute on function public.keiri_tenant_activate(text, text, text, date, numeric, text) to anon, authenticated;
grant execute on function public.keiri_tenant_login(text) to anon, authenticated;

-- ★ keiri_tenant_create_manual は anon に渡しません（運営が SQL Editor から呼ぶだけ）。
--
--   ここが大事です。上の `revoke ... from public` だけでは **足りません**。
--   Supabase は「これから作る関数は anon と authenticated が呼んでよい」という
--   既定の決まり（alter default privileges）を入れてあるので、
--   新しく作った窓口には **anon への権利が自動で直接付きます**。
--   `from public` の取り上げは、その直接の権利には届きません。
--   （2026-09-19 17:05・A がこのファイルをそのまま流したところ、
--     create_manual が外から呼べる状態になっていたのを実測で見つけました。
--     そのときは A が手で1行足して閉じましたが、
--     ファイルに書いていないと **次に流し直したときに黙って開きます**。）
--
--   ＝ 名指しで取り上げます。これが無いと、誰でもお店の行を作れてしまいます。
revoke all on function public.keiri_tenant_create_manual(text, text) from anon, authenticated;


-- ------------------------------------------------------------
-- 実行後の確かめ方（この3つだけ）
-- ------------------------------------------------------------
-- 1) 窓口が3つできたか
--    select proname from pg_proc
--     where proname in ('keiri_tenant_activate','keiri_tenant_login','keiri_tenant_create_manual');
--
-- 2) 外から来る人（anon）に渡っているのが2つだけか
--    select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon_can_call
--      from pg_proc p
--     where p.proname like 'keiri_tenant_%';
--    → activate と login が true、create_manual が **false** なら正しい状態です。
--
-- 3) 合言葉が合わないときに何も返らないか（0行が正解）
--    select * from public.keiri_tenant_login(repeat('0', 64));
--
-- そのあと、本番の https://tebaya-report.vercel.app/api/keiri/diagnose を開いて
-- tenant_rpc が "usable": true になっていれば成功です（アプリ側は対応ずみ）。


-- ------------------------------------------------------------
-- 元に戻すとき（この3行）
-- ------------------------------------------------------------
-- drop function if exists public.keiri_tenant_activate(text, text, text, date, numeric, text);
-- drop function if exists public.keiri_tenant_login(text);
-- drop function if exists public.keiri_tenant_create_manual(text, text);
