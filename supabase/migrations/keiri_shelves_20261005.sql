-- ============================================================
-- 経理パッケージ：倉庫に1回だけ流す「貼り紙」（2026-10-05・kp237）
--
-- ■ これは何か（やさしい説明）
--   いまコードだけでは先へ進めない仕事が3つあって、どれも
--   「倉庫（Supabase）に置き場（棚）が無い」ことで止まっています。
--   その足りない棚を **まとめて1回で足す**ための1枚です。
--
--   ① 金庫を数えた記録と、売上の現金を銀行に入れた記録を置く棚
--      → これができると「計算上の残高」と「実際に数えた残高」を突き合わせられます。
--   ② 同じ支払いが2か所に書かれているときに「こちらは数えない」と印を付ける棚
--      → これができると、毎月同じ重なりを見続けずに、1回で片付けられます。
--   ③ 経理が読む軽い日報に「レシート写真が付いているか」の印を足す
--      → これができると、写真のある経費を拾って読み取りに回せます。
--   ④ 立替の古い棚（いま使われている方）に「どの店のものか」の欄を足す
--      → これができると、お店が増えても立替が混ざりません。
--   ⑤ シフトの棚に「どの店のものか」の欄を足す（2026-10-08 追記）
--      → ここが最後の穴でした。これができると、お店が増えてもシフトも混ざりません。
--   ⑥ テストのお店1軒を、この1枚の中で作って初回設定まで済ませる（2026-10-09 追記）
--      → これができると、2軒目を入れる手順を こちら（Claude）だけで通せます。
--        いままでは、お店1軒ぶんの行を作れるのが「サーバー側の鍵」だけで、
--        その鍵が壊れているため（kp241）テストの店が1軒も作れず、
--        **この1枚とは別に、もう1つの手続きを待つ**形になっていました。
--        ⑥を入れたので、**この1枚を1回 貼るだけで、止まっている3つとも動きます。**
--   ⑦ 手羽屋のデータの「写し」に鍵をかける（2026-10-13 追記・2026-10-14 広げました）
--      → 2026-09-02 に取った日報の控えだけ、だれが読めるかの決まりが付いておらず、
--        公開の鍵を持っていれば誰でも読めました。**消さずに鍵をかけます。**
--        2026-10-14 に、同じことが他の写しでも起きないよう、名前のかたちで
--        機械的に拾う形に広げました（控え・引っ越し前の控え・日付が付いた写し）。
--        **いま使っている棚には1つも届きません**（止め木3つ。⑦の所に書いてあります）。
--   ⑧ よその店の日報を、公開の鍵では読めないようにする（2026-10-15 追記）
--      → ⑦で写しに鍵をかけても、**いま使っている日報の棚そのもの**が
--        「だれでも・条件なし」の決まり1本だけで、公開の鍵で読めたままでした
--        （2026-10-14 実測）。⑧で「**印が空の行だけ 読んでよい**」を足します。
--        手羽屋の行は印が空なので**見え方は1行も変わりません**。
--        よその店が自分の数字を読む道は、同じ⑧で作る**倉庫の窓口**を通します。
--   ⑨ 払った記録の棚に「どの店のものか」の欄を足す（2026-10-17 追記）
--      → 印の欄が無い棚は、数え直したらここ1つだけでした。欄が無いと締められません。
--   ⑩ 立替（経営・51行＝本物の棚）を、よその店ぶんだけ公開の鍵で読めないようにする
--      （2026-10-17 追記）
--      → ⑧は日報だけを締めます。経理にはほかにも棚があり、**中身が入っている
--        いちばん大きい棚が立替（経営）**でした。⑧と同じ形（決まり＋窓口を対で）
--        で締めます。**手羽屋の51行は印が空なので、見え方は1行も変わりません。**
--
-- ■ 安全について（ここが大事）
--   ・**足すだけ**です。消す・名前を変える・作り変えるものは1つもありません
--     （drop / delete / truncate は1行も入っていません）。
--   ・3か所だけ「棚を足す」ではありません：
--     ⑦で、手羽屋のデータの写しに**鍵をかけます**。
--       消しません・中身は1行も触りません・1行（disable）で元に戻せます。
--     ⑧で、日報の棚に「**印が空の行だけ 読んでよい**」という決まりを**1本 足します**。
--       いまある決まりは触りません（消す・名前を変える・作り変えるをしません）。
--       手羽屋の行は印が空なので見え方は変わりません。1行（drop policy）で元に戻せます。
--     ⑩で、立替（経営）の棚に⑧と同じ決まりを**1本 足します**。
--       手羽屋の51行は印が空なので見え方は変わりません。1行（drop policy）で元に戻せます。
--   ・何度流しても同じ結果です（if not exists / create or replace）。
--   ・手羽屋が毎日使う画面（日報・シフト・レジ・LINE・お金の計算）の棚は
--     触っていません。④の欄を足す棚も、立替だけで日報ではありません。
--   ・**流す前と流した後で、いまの画面は1つも変わりません。**
--     新しい棚を読むところは「棚が無ければ何も出さない」作りにしてあります。
--
-- ■ 流し方（2分）
--   Supabase（vtuyebyjbvjmucqpkxug）→ 左の SQL Editor → この中身をぜんぶ貼る → Run
--   → いちばん下の「確かめ方」を貼ると、できた棚の名前が出ます。
--   → 本番の https://tebaya-report.vercel.app/api/keiri/shelves を開くと、
--     流せたかどうかが日本語で出ます（こちら側から確かめられます）。
-- ============================================================


-- ============================================================
-- ① 金庫を数えた記録と、銀行に入れた記録（f1-4）
--
--   これを流すと：**「計算上いくら」と「実際にいくらあった」を比べられる**
--   ようになります（いまは数えた記録を書く場所がどこにも無く、
--   最後の実測は 2026-09-10 の145,000円＝経理の設定の起点1回だけです）。
--
--   ★ kind が 'count'   … その日に金庫を数えた結果（残高そのもの）
--     kind が 'deposit' … 売上の現金を銀行に入れた（現金が減る道）
--   ★ 'deposit' は **経費ではありません**。科目別の経費・利益には1円も混ぜません
--     （混ぜると利益を間違えます）。
-- ============================================================
create table if not exists public.keiri_cash_events (
  id          bigserial primary key,
  -- 'count'（数えた）／'deposit'（銀行に入れた）
  kind        text        not null check (kind in ('count', 'deposit')),
  -- その記録の日（過去の日付も入れられる）
  happened_on date        not null,
  -- count＝数えた残高／deposit＝入れた金額。どちらも円・マイナスは入れない
  amount      integer     not null check (amount >= 0),
  -- 数えた人・入れた人（名前だけ。連絡先は入れない）
  actor       text,
  -- 差が出たときの理由や、ひとこと
  note        text,
  -- どの店のものか。空（null）＝手羽屋
  tenant_id   uuid        references public.keiri_tenants (id),
  created_at  timestamptz not null default now()
);

comment on table public.keiri_cash_events is
  '金庫を数えた記録（count）と、売上の現金を銀行に入れた記録（deposit）。deposit は経費ではない（2026-10-05・kp237・f1-4）';
comment on column public.keiri_cash_events.kind is
  'count＝その日に数えた金庫の残高／deposit＝銀行に入れた金額（現金が減る道）';
comment on column public.keiri_cash_events.tenant_id is
  'どの店のものか。空（null）＝手羽屋。値＝keiri_tenants.id';

create index if not exists keiri_cash_events_tenant_date_idx
  on public.keiri_cash_events (tenant_id, happened_on desc);

alter table public.keiri_cash_events enable row level security;

-- いまのアプリはブラウザから直接読み書きする作りなので、
-- 決まりは既存の棚と同じ「全員OK」にそろえる（CLAUDE.md 4-8）。
-- 締めるには読み書きをサーバー側に寄せる必要があり、それは別の工事。
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'keiri_cash_events'
      and policyname = 'keiri_cash_events_all'
  ) then
    create policy keiri_cash_events_all on public.keiri_cash_events
      for all using (true) with check (true);
  end if;
end $$;


-- ============================================================
-- ② 同じ支払いを「こちらは数えない」と印を付ける棚（kp230・f1-5）
--
--   これを流すと：**同じ支払いが2か所にある疑いを、1回で片付けられる**
--   ようになります（9月は同じ月で 90,571円・月をまたいで 385,000円 が重なっています）。
--
--   ★ 元の行（日報の経費・立替台帳）は **1行も消しません・書き換えません**。
--     「こちらは数えない」という印をこの棚に1行置くだけです。
--   ★ 戻すときも消しません。undone_at に日時を入れて「戻した」にします。
-- ============================================================
create table if not exists public.keiri_expense_ignores (
  id         bigserial primary key,
  -- どの入り口の記録か：report＝日報の経費／advance_owner＝経営側の立替／advance_field＝現場の立替
  source     text        not null check (source in ('report', 'advance_owner', 'advance_field')),
  -- 元の行の番号（日報なら daily_reports.id、立替ならその棚の id を文字で）
  ref_id     text        not null,
  -- 日報の経費の何行目か（0から数える）。日報以外は空
  line_index integer,
  -- 控えの金額と日（あとで突き合わせるため。計算にはこの値を使わない）
  amount     integer,
  paid_on    date,
  -- なぜ数えないか（人が書く）
  reason     text,
  marked_by  text,
  -- 戻したとき。空＝いま「数えない」が効いている
  undone_at  timestamptz,
  tenant_id  uuid        references public.keiri_tenants (id),
  created_at timestamptz not null default now()
);

comment on table public.keiri_expense_ignores is
  '同じ支払いが2か所にあるときに「こちらは数えない」と印を付ける棚。元の行は消さない・書き換えない（2026-10-05・kp237・kp230）';
comment on column public.keiri_expense_ignores.undone_at is
  '戻した日時。空＝いま「数えない」が効いている。印は消さずに残す';

-- 同じ行に「効いている印」が2つ付かないようにする
create unique index if not exists keiri_expense_ignores_one_live_idx
  on public.keiri_expense_ignores (source, ref_id, coalesce(line_index, -1))
  where undone_at is null;

create index if not exists keiri_expense_ignores_tenant_idx
  on public.keiri_expense_ignores (tenant_id, paid_on);

alter table public.keiri_expense_ignores enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'keiri_expense_ignores'
      and policyname = 'keiri_expense_ignores_all'
  ) then
    create policy keiri_expense_ignores_all on public.keiri_expense_ignores
      for all using (true) with check (true);
  end if;
end $$;


-- ============================================================
-- ③ 経理が読む軽い日報に「レシート写真が付いているか」の印を足す（f1-6）
--
--   これを流すと：**写真のある経費の行を拾えるようになります。**
--   いまの軽い日報（keiri_reports）はレシート写真の住所を抜いているので
--   （重くなるのを防ぐため・CLAUDE.md 4-2）、
--   「写真があるかどうか」すら分からず、読み取りに回す行を選べませんでした。
--   住所は**今までどおり抜いたまま**で、「ある／ない」の印だけを足します。
--
--   ★ 元の棚（daily_reports）は1文字も変わりません。見え方だけの話です。
--   ★ 列は **いちばん後ろに足します**。途中に差し込むと倉庫が断ります（42P16）。
-- ============================================================
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
  -- 経費の明細。写真の住所は抜いたまま、代わりに has_receipt（ある／ない）を足す
  coalesce(
    (
      select jsonb_agg(
        (x - 'receipt_image_url')
        || jsonb_build_object(
             'has_receipt',
             coalesce(btrim(x ->> 'receipt_image_url'), '') <> ''
           )
      )
      from jsonb_array_elements(
        case when jsonb_typeof(r.expenses) = 'array' then r.expenses else '[]'::jsonb end
      ) as x
    ),
    '[]'::jsonb
  ) as expenses,
  r.tenant_id,
  -- 写真が付いている経費の行数（0なら1枚も無い）
  coalesce(
    (
      select count(*)
      from jsonb_array_elements(
        case when jsonb_typeof(r.expenses) = 'array' then r.expenses else '[]'::jsonb end
      ) as x
      where coalesce(btrim(x ->> 'receipt_image_url'), '') <> ''
    ),
    0
  )::int as receipt_count
from daily_reports r;

comment on view keiri_reports is
  'レシート写真の住所を抜いた軽い日報。2026-10-05 から「写真があるか」の印（各行の has_receipt と receipt_count）を足した（kp237・f1-6）';


-- ============================================================
-- ④ 立替の古い棚に「どの店のものか」の欄を足す（f3-4）
--
--   これを流すと：**お店が増えても立替が混ざらなくなります。**
--   いま実際に使われているのは古い棚（advance_expenses・51行）の方で、
--   こちらには「どの店か」の欄がありませんでした（新しい棚には 9/24 に足してあります）。
--
--   ★ 欄を足すだけです。いまある51行は1行も書き換えません。
--     空（null）＝手羽屋、という今までの決まりのままです。
-- ============================================================
alter table public.advance_expenses
  add column if not exists tenant_id uuid references public.keiri_tenants (id);

comment on column public.advance_expenses.tenant_id is
  'どの店の立替か。空（null）＝手羽屋。値＝keiri_tenants.id。既存の行はすべて空のまま';

create index if not exists advance_expenses_tenant_idx
  on public.advance_expenses (tenant_id, date);


-- ============================================================
-- ⑤ シフトの棚に「どの店のものか」の欄を足す（f3-4・f5-4／2026-10-08 追記）
--
--   これを流すと：**お店が増えても、シフトが混ざらなくなります。**
--   お店を分ける印は 日報・出店場所・担当者・商品・立替 の棚にはもう足してあり、
--   読む所もすべて絞ってあります（2026-10-08 に機械的に数え直して確認）。
--   残っていた穴は **シフト（shifts）1つだけ**で、この棚には欄そのものが無く、
--   コードだけでは閉じられませんでした。
--
--   ★ 欄を足すだけです。いまある行は1行も書き換えません。
--     空（null）＝手羽屋、という今までの決まりのままです。
--   ★ 鍵（RLS）の決まりは1つも変えません。誰が何をできるかは今までどおりです。
--   ★ 流す前と流した後で、手羽屋のシフト画面は1つも変わりません
--     （読む所は「印が空のものだけ」＝いまと同じ結果になるように、流れたあとに直します）。
--   ★ 棚が見つからない倉庫でも途中で止まらないように、あるときだけ足します。
-- ============================================================
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'shifts'
  ) then
    alter table public.shifts
      add column if not exists tenant_id uuid references public.keiri_tenants (id);

    execute $c$comment on column public.shifts.tenant_id is
      'どの店のシフトか。空（null）＝手羽屋。値＝keiri_tenants.id。既存の行はすべて空のまま'$c$;

    create index if not exists shifts_tenant_idx on public.shifts (tenant_id);
  end if;
end $$;


-- ============================================================
-- ⑥ テストのお店1軒を、この1枚の中で作って初回設定まで済ませる（f5-4・f3-4／2026-10-09 追記）
--
--   これを流すと：**2軒目を入れる手順を、じゅんの手を借りずに1回 通せます。**
--   お店の棚（keiri_tenants）はブラウザから読めも書けもしない決まりなので、
--   行を作れるのは「サーバー側の鍵（SUPABASE_SERVICE_ROLE_KEY）」を持つ側だけです。
--   その鍵はいま壊れており（kp241）、貼り直すには じゅんが別の画面を2つ 開く必要があります。
--   そのため仕上げの f5-4 が、この1枚とは別の手続きも待つ形になっていました。
--   ここで **テストの店1軒を、この1枚の中で作ってしまいます。**
--   ＝ この1枚を貼った時点で、鍵の貼り直しを待たずに f5-4 まで動きます。
--
--   ★ 新しい窓口（関数）は1つも作りません。誰が何をできるか（権限・鍵の決まり）も
--     1つも変えません。やるのは **行を1つ足して、すでにある窓口を1回 呼ぶ**だけです。
--   ★ 何度 流しても増えません（同じ目印の行があれば何もしません）。
--   ★ 管理画面の合言葉は、この中で作ってその場で捨てます。生の値はどこにも残しません。
--     ＝**このテストの店には誰も入れません**（外から覗かれる心配がありません）。
--   ★ 手羽屋には1行も触れません。足すのは お店の棚に1行、
--     そのお店ぶんの経理の設定に1行（業態コードは t_<お店の番号>）、
--     そして **そのお店ぶんの日報1枚**（手順5・架空の金額）だけです。
--     どれも「どの店か」の印がテストの店で、名前の頭に【テスト】が付きます。
--     手羽屋の行（印が空）は1行も読み書きしません。
--     経費・申し込み・出店場所・担当者・商品の行は**1行も作りません**。
--
--   ★ **日報1枚をここで入れる理由（2026-10-17 B・本番の前に実測して分かりました）**
--     ⑧で足す決まり（印が空の行だけ 読んでよい・restrictive for select）は、
--     読むときだけでなく **「入れた行を読み返す」「印つきの行を消す」にも効きます**。
--     PostgreSQL 16 で実際に試した結果：
--       ・公開の鍵で「印つきの日報を入れて、その番号を返してもらう」… **断られます**
--         （new row violates row-level security policy）
--       ・公開の鍵で「印つきの日報を消す」… **0行しか消えません**（黙って何も起きない）
--     ＝ アプリ側（公開の鍵）からは、テストの店の日報を入れることも消すこともできません。
--     そのため手順5は、鍵の決まりの外で動くこの1枚の中で済ませます。
--     これで ⑧ を流したあとも手順4〜6が通ります（手順4の出店場所は印の欄に
--     読む決まりが無いので、今までどおりアプリ側から入ります）。
--   ★ 値は lib/keiri/tenantTrial.ts の TEST_SHOP と同じ固定値です
--     （名前の頭に【テスト】が付きます。本物の軒数には数えないこと）。
-- ============================================================
do $$
declare
  c_mark    constant text := 'test-b2-kensa-1006';
  c_name    constant text := '【テスト】B2検査食堂';
  c_date    constant date := '2026-10-06';
  c_balance constant numeric := 30000;
  v_id uuid;
  v_token text;
  v_status text;
  -- 戻せない形（16進64文字）。ここで作って、ここで捨てる
  v_hash text := md5(random()::text || clock_timestamp()::text)
               || md5(random()::text || clock_timestamp()::text);
  v_outcome text;
begin
  select t.id, t.setup_token, t.status
    into v_id, v_token, v_status
    from public.keiri_tenants t
   where t.external_session_id = c_mark
   limit 1;

  if v_id is null then
    insert into public.keiri_tenants (
      shop_name, template, setup_token, source, status,
      external_session_id, external_customer_id
    ) values (
      null, 'generic',
      md5(random()::text || clock_timestamp()::text)
        || substr(md5(random()::text || clock_timestamp()::text), 1, 16),
      'manual', 'pending', c_mark, c_mark
    )
    on conflict do nothing;

    select t.id, t.setup_token, t.status
      into v_id, v_token, v_status
      from public.keiri_tenants t
     where t.external_session_id = c_mark
     limit 1;
  end if;

  -- 初回設定は、すでにある窓口にやらせる（同じ道を通す＝二重の作りを持たない）
  if v_id is not null and v_status = 'pending' then
    select a.outcome into v_outcome
      from public.keiri_tenant_activate(
             v_token, null, c_name, c_date, c_balance, v_hash
           ) a;
    raise notice '⑥ テストの店の初回設定：%', coalesce(v_outcome, '（返事なし）');
  else
    raise notice '⑥ テストの店は、もうありました（何もしていません）';
  end if;

  -- ---------------------------------------------------------------
  -- 手順5：そのお店ぶんの日報を1枚 入れる（f5-4）
  --
  --   値は lib/keiri/tenantTrialSteps.ts の TEST_REPORT / TEST_LOCATION と
  --   同じ固定値です（tests/keiriShelvesSheet.test.ts で ずれないように縛っています）。
  --   ★金額はぜんぶ架空です。本物の数字は1つも使いません。
  --   ★同じお店・同じ日の行があれば何もしません（何度 流しても増えません）。
  -- ---------------------------------------------------------------
  if v_id is not null then
    if exists (
         select 1 from public.daily_reports r
          where r.tenant_id = v_id and r.date = c_date
       ) then
      raise notice '⑥ 手順5の日報は、もうありました（何もしていません）';
    else
      insert into public.daily_reports (
        tenant_id, date, shop, location, staff_name,
        sales_amount, cumulative_sales, register_total, register_ok, register_diff,
        labor, expenses, handover, line_text
      ) values (
        v_id, c_date, '手羽屋', '【テスト】テスト広場', '【テスト】テスト太郎',
        30000, 30000, 30000, true, 0,
        10000,
        '[{"description":"【テスト】消耗品","amount":1000,"receipt_image_url":null,"no_receipt_reason":"テスト（架空の行）"}]'::jsonb,
        '【テスト】2軒目を入れる手順の確かめ（手順5）', ''
      );
      raise notice '⑥ 手順5の日報を1枚 入れました（印はテストの店・手羽屋の行は1行も触っていません）';
    end if;
  end if;
end $$;




-- ============================================================
-- ⑦ 日報の「古い控え」に鍵をかける（f3-4／2026-10-13 追記）
--
--   これを流すと：**手羽屋の日報の古い控えが、表に出ている鍵では読めなくなります。**
--
--   2026-09-02 にレシート写真を置き場へ引っ越す前に取った控え
--   （daily_reports_backup_20260902・13行）には、
--   「だれが読めるか」の決まり（RLS）が **1つも付いていません**。
--   そのため、ブラウザに配られている公開の鍵を持っていれば誰でも読めます。
--   日報の本体はお店ごとに分ける工事を進めていますが、この控えはその工事の外にあり、
--   ここが開いているあいだは「お店ごとに分かれている」とは言えません
--   （2026-10-13 に倉庫の点検で見つかりました）。
--
--   ★ **消しません。** 控えは「元に戻す命綱」です（CLAUDE.md 4-6・4-11）。
--     やるのは鍵をかけるだけで、中の13行は1行も触りません。
--   ★ 決まり（ポリシー）は1本も作りません。
--     ＝ サーバー側の鍵と、倉庫の SQL Editor からだけ読めます。
--     毎日の控え（table_snapshots）と同じ、正しい形です（CLAUDE.md 4-8）。
--   ★ 元に戻せます（alter table ... disable row level security の1行）。
--   ★ 手羽屋が毎日使う画面は1つも変わりません。
--     この控えを読んでいる所は、アプリの中に1つもありません
--     （住所・テンプレート・部品の取り込みの3通りで数えて0件・CLAUDE.md 4-11）。
--     書き戻しの手順（docs/keiri.md 11-3）は倉庫の SQL Editor から行うので、
--     鍵がかかっても今までどおり使えます。
--   ★ **2026-10-14 追記：日報の控えだけでなく、「写し」ぜんぶに広げました。**
--     1つ見つけて終わりにすると、同じことがまた起きます。そこで名前のかたちで
--     機械的に拾います（…_backup / …_bak / …_copy / …_old / …_snapshot /
--     deleted_… / うしろに日付が付いているもの）。
--     ★取り違えないための止め木を3つ重ねています：
--       ① **まだ鍵がかかっていない棚だけ**（いま使っている棚はすべて鍵が付いているので届きません）
--       ② **決まり（ポリシー）が1本も無い棚だけ**（いま使っている棚には「全員OK」が1本あります）
--       ③ **別のアプリの棚（pkmn_…）は触りません**（CLAUDE.md 4-11）
--     ＝ 名前で取り違えても、いま使っている棚には1つも届きません。
--     どれが開いているかは https://tebaya-report.vercel.app/api/keiri/copies で外から読めます。
--   ★ もう鍵が付いているもの・控えが無い倉庫では、何もしません（何度流しても同じ）。
-- ============================================================
do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select c.oid::regclass as rel, c.relname as nm
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public'
       and c.relkind = 'r'
       -- ★止め木①：まだ鍵がかかっていない棚だけ
       --   （いま使っている棚はすべて鍵が付いているので、ここに入りません）
       and c.relrowsecurity = false
       -- ★止め木②：決まり（ポリシー）が1本も無い棚だけ
       --   （いま使っている棚には「全員OK」の決まりが1本あります）
       and not exists (
             select 1 from pg_policies pp
              where pp.schemaname = 'public' and pp.tablename = c.relname
           )
       -- ★止め木③：別のアプリの棚は触らない（CLAUDE.md 4-11）
       and c.relname not like 'pkmn\_%'
       -- 「写し」の名前のかたち。lib/keiri/copyTables.ts と同じ見分けにそろえてある
       and (
             c.relname ~ '(^|_)backups?(_|$)'
          or c.relname ~ '(^|_)bak(_|$)'
          or c.relname ~ '(^|_)copy(_|$)'
          or c.relname ~ '(^|_)old(_|$)'
          or c.relname ~ '(^|_)snapshots?(_|$)'
          or c.relname ~ '^deleted_'
          or c.relname ~ '_(19|20)[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])$'
          or c.relname ~ '_(19|20)[0-9]{2}(0[1-9]|1[0-2])$'
           )
  loop
    execute format('alter table %s enable row level security', r.rel);
    n := n + 1;
    raise notice '⑦ 手羽屋のデータの写しに鍵をかけました：%（中身は1行も触っていません）', r.nm;
  end loop;

  if n = 0 then
    raise notice '⑦ 鍵をかける写しはありませんでした（もう鍵が付いている／写しが無い）';
  end if;
end $$;


-- ============================================================
-- ⑧ よその店の日報を、公開の鍵では読めないようにする（f3-4／2026-10-15 追記）
--
--   これを流すと：**お店が2軒になっても、ブラウザに配られている公開の鍵では
--   よその店の日報が1行も読めなくなります。**
--
-- ■ なぜ要るのか（やさしい説明）
--   日報の棚（daily_reports）には「どの店のものか」の印（tenant_id）が
--   すでに付いていて、アプリの読む所はぜんぶ その印で絞っています。
--   ところが**棚そのものの決まりは『だれでも・ぜんぶの操作・条件なし』の1本だけ**で、
--   アプリを通さずに公開の鍵で聞けば、印が付いた行もそのまま読めます
--   （2026-10-14 に /api/keiri/copies の live で外から実測）。
--   ＝ ⑦で写しに鍵をかけても、本体がこの形のままでは
--   「お店ごとに分かれている」とは言えません。
--
-- ■ 手羽屋は1行も変わりません（ここが大事）
--   手羽屋の行は**印が空**です（178行すべて空・2026-10-06 実測）。
--   足す決まりは「**印が空の行だけ 読んでよい**」なので、
--   手羽屋が毎日使う画面（日報・シフト・レジ・管理・集計）の見え方は
--   **1行も変わりません**。読めなくなるのは、印が付いた行＝よその店の行だけです。
--
-- ■ 足すだけ・消しません（やり方）
--   いまある「だれでもOK」の決まりは**触りません**（消す・名前を変える・作り変えるを
--   しないため）。代わりに「**追い禁止**」の決まり（restrictive）を1本 足します。
--   データベースは、ふつうの決まりと追い禁止の決まりの**両方を満たす行だけ**を見せます。
--   ＝ 「だれでもOK」かつ「印が空」＝ いまの手羽屋の行だけ。
--   ★元に戻すのは1行です：
--     drop policy "keiri_only_tebaya_rows_readable" on public.daily_reports;
--
-- ■ 書き込みは今までどおりです
--   足す決まりは**読むときだけ**に効きます（for select）。
--   手羽屋の日報の保存・書き換え・取り消し（印が空の行）は1つも変わりません。
--
--   ★ただし**印が付いた行（よその店の行）は別です**（2026-10-17 B・実測して書き直しました）。
--     読む決まりは「入れた行を読み返す」「印つきの行を消す」にも効くので、
--     公開の鍵では **印つきの日報を入れて番号を受け取ることも、消すこともできません**
--     （前は「テストの店の日報を1枚 入れて取り消す道も通ります」と書いていましたが、
--       これは**誤り**でした。PostgreSQL 16 で試して分かりました）。
--     ＝ テストの店の日報は⑥の中で入れます。アプリ側からは入れません。
--
-- ■ よその店は、どうやって自分の数字を見るのか
--   下の(b)で**倉庫の窓口**（keiri_tenant_reports）を1つ作ります。
--   窓口は**合言葉（戻せない形）からお店を決めます**。
--   画面やブラウザが名乗った「お店の番号」は**受け取りません**（kp239 ②と同じ決まり）。
--   ＝ 番号を書き換えても、よその店の帳簿は開きません。
-- ============================================================

-- (a) 「印が空の行だけ 読んでよい」という追い禁止の決まりを1本 足す
do $$
begin
  if exists (
       select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'daily_reports'
          and policyname = 'keiri_only_tebaya_rows_readable'
     ) then
    raise notice '⑧ 読む決まりは、もうありました（何もしていません）';
  else
    create policy "keiri_only_tebaya_rows_readable" on public.daily_reports
      as restrictive for select to public
      using (tenant_id is null);
    raise notice '⑧ よその店の日報を、公開の鍵では読めないようにしました（手羽屋の行＝印が空は今までどおり）';
  end if;
end $$;

-- (b) よその店が自分の日報を読むための「倉庫の窓口」
--
--   ★返すのは**その店の日報だけ**です。合言葉・お店の名前・連絡先・鍵の値は
--     1文字も返しません。レシート写真の住所は今までどおり抜いてあります
--     （keiri_reports ごしに読むため・CLAUDE.md 4-2）。
--   ★入り口は2つだけ：
--     ・合言葉（戻せない形・16進64文字）… 本物のお店が自分の数字を読む道
--     ・テストの印（test- で始まり、店名が【テスト】で始まるお店だけ）
--       … 2軒目を入れる手順を こちら側で通すための道（f5-4）
--   ★当たったお店が1軒でないときは、**何も返しません**
--     （「合っているほうに見せる」より「間違ったほうに見せない」を先にする。
--       lib/keiri/tenantAccess.ts の pickSingleTenant と同じ決まり）。
create or replace function public.keiri_tenant_reports(
  p_password_hash text default null,
  p_from date default null,
  p_to date default null,
  p_test_mark text default null
)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_n int;
begin
  if p_test_mark is not null and btrim(p_test_mark) <> '' then
    -- テストの店の道。名前のかたちを2つとも満たすものだけ
    if btrim(p_test_mark) !~ '^test-' then
      return;
    end if;
    select count(*) into v_n
      from public.keiri_tenants t
     where t.external_session_id = btrim(p_test_mark)
       and coalesce(t.shop_name, '') like '【テスト】%';
    if v_n <> 1 then
      return;
    end if;
    select t.id into v_tenant
      from public.keiri_tenants t
     where t.external_session_id = btrim(p_test_mark)
       and coalesce(t.shop_name, '') like '【テスト】%'
     limit 1;
  else
    -- 本物のお店の道。合言葉（戻せない形）からお店を決める
    if p_password_hash is null or btrim(lower(p_password_hash)) !~ '^[0-9a-f]{64}$' then
      return;
    end if;
    select count(*) into v_n
      from public.keiri_tenants t
     where t.admin_password_hash = btrim(lower(p_password_hash))
       and t.status = 'active';
    if v_n <> 1 then
      return;
    end if;
    select t.id into v_tenant
      from public.keiri_tenants t
     where t.admin_password_hash = btrim(lower(p_password_hash))
       and t.status = 'active'
     limit 1;
  end if;

  if v_tenant is null then
    return;
  end if;

  return query
    select to_jsonb(x)
      from (
        select r.id,
               r.date,
               r.location,
               r.staff_name,
               r.shop,
               r.sales_amount,
               r.labor,
               r.expenses,
               d.unit_number,
               d.register_total
          from public.keiri_reports r
          join public.daily_reports d on d.id = r.id
         where r.tenant_id = v_tenant
           and (p_from is null or r.date >= p_from)
           and (p_to is null or r.date <= p_to)
         order by r.date
      ) x;
end $$;

comment on function public.keiri_tenant_reports(text, date, date, text) is
  '経理：よその店が自分の日報だけを読む窓口（f3-4）。お店は合言葉かテストの印から決め、画面が名乗った番号は受け取らない。読むだけ。';

revoke all on function public.keiri_tenant_reports(text, date, date, text) from public;
grant execute on function public.keiri_tenant_reports(text, date, date, text)
  to anon, authenticated, service_role;

-- ============================================================
-- ⑨ 払った記録の棚に「どの店のものか」の欄を足す（f3-4／2026-10-17 追記）
--
--   これを流すと：**お店が増えても、払った記録が混ざらなくなります。**
--   2026-10-17 に外から数え直して分かったことです。お店を分ける印は
--   日報・出店場所・担当者・商品・立替（新）・経理の設定 には もうありました。
--   ④で立替（古）に、⑤でシフトに足します。**残っていたのは
--   「払った記録（keiri_payments）」1つだけ**で、この棚には欄そのものがありません。
--   欄が無いと、そもそも「どの店の行か」を見分けられないので、
--   あとで締めることもできません（締める工事は、この欄がそろってからです）。
--
--   ★ 欄を足すだけです。いまある行は1行も書き換えません。
--     空（null）＝手羽屋、という今までの決まりのままです。
--   ★ 鍵（RLS）の決まりは1つも変えません。誰が何をできるかは今までどおりです。
--   ★ 読む所も変えません。**流す前と後で、手羽屋の画面は1つも変わりません。**
--   ★ 棚が見つからない倉庫でも途中で止まらないように、あるときだけ足します。
-- ============================================================
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'keiri_payments'
  ) then
    alter table public.keiri_payments
      add column if not exists tenant_id uuid references public.keiri_tenants (id);

    execute $c$comment on column public.keiri_payments.tenant_id is
      'どの店の払った記録か。空（null）＝手羽屋。値＝keiri_tenants.id。既存の行はすべて空のまま'$c$;

    create index if not exists keiri_payments_tenant_idx
      on public.keiri_payments (tenant_id);
  end if;
end $$;


-- ============================================================
-- ⑩ 立替（経営・いま51行 入っている本物の棚）を、よその店ぶんだけ
--    公開の鍵では読めないようにする（f3-4／2026-10-17 追記）
--
--   これを流すと：**お店が2軒になっても、ブラウザに配られている公開の鍵では
--   よその店の立替が1行も読めなくなります。**
--
-- ■ なぜ「立替（経営）」から締めるのか（2026-10-17 に数え直して分かったこと）
--   立替の棚は**2つ**あります。中身が入っているのは
--   `advance_expenses`（経営側・51行）で、`keiri_advance_expenses`（現場・0行）は
--   まだ空です。経理の窓口が「立替51件」と答える中身も前者で、件数が一致しました。
--   ＝ **本物の棚はこちら**なので、空のほうを締めても意味がありません。
--   （この1行の決め：**立替の本物は `advance_expenses` として扱う。**
--     空の `keiri_advance_expenses` は、中身が入り始めてから同じ形で締めます。）
--
-- ■ 手羽屋は1行も変わりません（ここが大事）
--   手羽屋の51行は**印が空**です。足す決まりは「**印が空の行だけ 読んでよい**」なので、
--   じゅんが毎日見る画面（/cash・/cash/advances・/sales-report・経理）の見え方は
--   **1行も変わりません**。読めなくなるのは、印が付いた行＝よその店の行だけです。
--   書き込みも今までどおりです（足す決まりは**読むときだけ**に効きます）。
--   立替の登録・精算・取り消し・削除は、どれも印が空の行なので通ります。
--
-- ■ 「欄が無い棚」について、ここで決めておきます（2026-10-17・B）
--   印の欄が無い棚があと3つありますが、**どれも締める対象の外**と決めました。
--   ・`keiri_account_mapping`（科目の対応表・12行）… 業態ごとの**全店共通の叩き台**で、
--     お店の数字が1文字も入りません（科目名・税区分だけ）。＝ 分ける必要がありません。
--   ・`cash_settings`（金庫の設定・1行）… 手羽屋の毎日の画面（/cash・/sales-report）
--     だけが使う棚です。経理（/keiri）が読むのは `keiri_settings` のほうで、
--     こちらには印の欄がもうあります。
--   ・`pre_registered_expenses`（先に登録した経費・2行）… アプリのどこからも
--     読み書きしていません（数えて0か所）。お店の数字が入る道がありません。
--
-- ■ 足すだけ・消しません（やり方は⑧と同じ）
--   いまある「だれでもOK」の決まりは**触りません**。代わりに「**追い禁止**」の
--   決まり（restrictive）を1本 足します。データベースは、ふつうの決まりと
--   追い禁止の決まりの**両方を満たす行だけ**を見せます。
--   ★元に戻すのは1行です：
--     drop policy "keiri_only_tebaya_advances_readable" on public.advance_expenses;
--
-- ■ よその店は、どうやって自分の立替を見るのか
--   下の(b)で**倉庫の窓口**（keiri_tenant_advances_old）を1つ作ります。
--   窓口は**合言葉（戻せない形）からお店を決めます**。画面やブラウザが名乗った
--   「お店の番号」は**受け取りません**（⑧と同じ決まり）。
-- ============================================================

-- (a) 「印が空の行だけ 読んでよい」という追い禁止の決まりを1本 足す
do $$
begin
  if exists (
       select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'advance_expenses'
          and policyname = 'keiri_only_tebaya_advances_readable'
     ) then
    raise notice '⑩ 立替（経営）の読む決まりは、もうありました（何もしていません）';
  else
    create policy "keiri_only_tebaya_advances_readable" on public.advance_expenses
      as restrictive for select to public
      using (tenant_id is null);
    raise notice '⑩ よその店の立替を、公開の鍵では読めないようにしました（手羽屋の51行＝印が空は今までどおり）';
  end if;
end $$;

-- (b) よその店が自分の立替だけを読むための「倉庫の窓口」
--
--   ★返すのは**その店の立替だけ**です。合言葉・お店の名前・連絡先・鍵の値は
--     1文字も返しません。レシート写真の住所も返しません（置き場の住所を外に出さないため）。
--   ★入り口は⑧と同じ2つだけ：
--     ・合言葉（戻せない形・16進64文字）… 本物のお店が自分の数字を読む道
--     ・テストの印（test- で始まり、店名が【テスト】で始まるお店だけ）… 2軒目の手順を通す道
--   ★当たったお店が1軒でないときは、**何も返しません**。
create or replace function public.keiri_tenant_advances_old(
  p_password_hash text default null,
  p_from date default null,
  p_to date default null,
  p_test_mark text default null
)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_n int;
begin
  if p_test_mark is not null and btrim(p_test_mark) <> '' then
    if btrim(p_test_mark) !~ '^test-' then
      return;
    end if;
    select count(*) into v_n
      from public.keiri_tenants t
     where t.external_session_id = btrim(p_test_mark)
       and coalesce(t.shop_name, '') like '【テスト】%';
    if v_n <> 1 then
      return;
    end if;
    select t.id into v_tenant
      from public.keiri_tenants t
     where t.external_session_id = btrim(p_test_mark)
       and coalesce(t.shop_name, '') like '【テスト】%'
     limit 1;
  else
    if p_password_hash is null or btrim(lower(p_password_hash)) !~ '^[0-9a-f]{64}$' then
      return;
    end if;
    select count(*) into v_n
      from public.keiri_tenants t
     where t.admin_password_hash = btrim(lower(p_password_hash))
       and t.status = 'active';
    if v_n <> 1 then
      return;
    end if;
    select t.id into v_tenant
      from public.keiri_tenants t
     where t.admin_password_hash = btrim(lower(p_password_hash))
       and t.status = 'active'
     limit 1;
  end if;

  if v_tenant is null then
    return;
  end if;

  return query
    select to_jsonb(x)
      from (
        select a.id,
               a.date,
               a.amount,
               a.payer,
               a.description,
               a.settled,
               a.settled_date
          from public.advance_expenses a
         where a.tenant_id = v_tenant
           and (p_from is null or a.date >= p_from)
           and (p_to is null or a.date <= p_to)
         order by a.date
      ) x;
end $$;

comment on function public.keiri_tenant_advances_old(text, date, date, text) is
  '経理：よその店が自分の立替（経営）だけを読む窓口（f3-4）。お店は合言葉かテストの印から決め、画面が名乗った番号は受け取らない。読むだけ。';

revoke all on function public.keiri_tenant_advances_old(text, date, date, text) from public;
grant execute on function public.keiri_tenant_advances_old(text, date, date, text)
  to anon, authenticated, service_role;


-- ============================================================
-- ⑪ 払った記録（給与・外注費）を、よその店ぶんだけ
--    公開の鍵では読めないようにする（f3-4／2026-10-18 追記）
--
--   これを流すと：**お店が増えても、よその店の「払った記録」が
--   ブラウザに配られている公開の鍵では1行も読めなくなります。**
--
-- ■ なぜ⑨の次がこれなのか（2026-10-18・B）
--   ⑨で、この棚に「どの店のものか」の欄を足しました。欄だけでは
--   **見分けが付くようになっただけ**で、読む所はまだ誰でも読めます。
--   締める順番は「中身が入っている棚から」と決めてあり（⑩の所に書いたとおり）、
--   立替（経営）のつぎに中身が入っているのが、この払った記録です。
--   ★ここには**給与の金額**が入ります。よその店の給与が見えるのは、
--     金額の間違いよりもまずいので、空の棚より先に締めます。
--
-- ■ 手羽屋は1行も変わりません（ここが大事）
--   手羽屋の払った記録は**印が空（null）**です。足す決まりは
--   「**印が空の行だけ 読んでよい**」なので、じゅんが見る経理画面
--   （/keiri の「まだ払っていないお金」「払った記録」）は**1行も変わりません**。
--   書き込みも今までどおりです（足す決まりは**読むときだけ**に効きます）。
--   ＝ 画面からの登録・取り消しは、今までと同じように通ります。
--
-- ■ 足すだけ・消しません（やり方は⑧⑩と同じ）
--   いまある「だれでもOK」の決まりは**触りません**。代わりに「**追い禁止**」の
--   決まり（restrictive）を1本 足します。データベースは、ふつうの決まりと
--   追い禁止の決まりの**両方を満たす行だけ**を見せます。
--   ★元に戻すのは1行です：
--     drop policy "keiri_only_tebaya_payments_readable" on public.keiri_payments;
--
-- ■ よその店は、どうやって自分の払った記録を見るのか
--   下の(b)で**倉庫の窓口**（keiri_tenant_payments）を1つ作ります。
--   窓口は**合言葉（戻せない形）からお店を決めます**。画面やブラウザが名乗った
--   「お店の番号」は**受け取りません**（⑧⑩と同じ決まり）。
-- ============================================================

-- (a) 「印が空の行だけ 読んでよい」という追い禁止の決まりを1本 足す
do $$
begin
  if not exists (
       select 1 from information_schema.tables
        where table_schema = 'public' and table_name = 'keiri_payments'
     ) then
    raise notice '⑪ 払った記録の棚がありませんでした（何もしていません）';
  elsif exists (
       select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'keiri_payments'
          and policyname = 'keiri_only_tebaya_payments_readable'
     ) then
    raise notice '⑪ 払った記録の読む決まりは、もうありました（何もしていません）';
  else
    create policy "keiri_only_tebaya_payments_readable" on public.keiri_payments
      as restrictive for select to public
      using (tenant_id is null);
    raise notice '⑪ よその店の払った記録を、公開の鍵では読めないようにしました（手羽屋の行＝印が空は今までどおり）';
  end if;
end $$;

-- (b) よその店が自分の払った記録だけを読むための「倉庫の窓口」
--
--   ★返すのは**その店の払った記録だけ**です。合言葉・お店の名前・連絡先・鍵の値は
--     1文字も返しません。
--   ★入り口は⑧⑩と同じ2つだけ：
--     ・合言葉（戻せない形・16進64文字）… 本物のお店が自分の数字を読む道
--     ・テストの印（test- で始まり、店名が【テスト】で始まるお店だけ）… 2軒目の手順を通す道
--   ★当たったお店が1軒でないときは、**何も返しません**。
create or replace function public.keiri_tenant_payments(
  p_password_hash text default null,
  p_from date default null,
  p_to date default null,
  p_test_mark text default null
)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_n int;
begin
  if p_test_mark is not null and btrim(p_test_mark) <> '' then
    if btrim(p_test_mark) !~ '^test-' then
      return;
    end if;
    select count(*) into v_n
      from public.keiri_tenants t
     where t.external_session_id = btrim(p_test_mark)
       and coalesce(t.shop_name, '') like '【テスト】%';
    if v_n <> 1 then
      return;
    end if;
    select t.id into v_tenant
      from public.keiri_tenants t
     where t.external_session_id = btrim(p_test_mark)
       and coalesce(t.shop_name, '') like '【テスト】%'
     limit 1;
  else
    if p_password_hash is null or btrim(lower(p_password_hash)) !~ '^[0-9a-f]{64}$' then
      return;
    end if;
    select count(*) into v_n
      from public.keiri_tenants t
     where t.admin_password_hash = btrim(lower(p_password_hash))
       and t.status = 'active';
    if v_n <> 1 then
      return;
    end if;
    select t.id into v_tenant
      from public.keiri_tenants t
     where t.admin_password_hash = btrim(lower(p_password_hash))
       and t.status = 'active'
     limit 1;
  end if;

  if v_tenant is null then
    return;
  end if;

  return query
    select to_jsonb(x)
      from (
        select p.id,
               p.paid_on,
               p.amount,
               p.kind,
               p.memo
          from public.keiri_payments p
         where p.tenant_id = v_tenant
           and (p_from is null or p.paid_on >= p_from)
           and (p_to is null or p.paid_on <= p_to)
         order by p.paid_on desc
      ) x;
end $$;

comment on function public.keiri_tenant_payments(text, date, date, text) is
  '経理：よその店が自分の払った記録（給与・外注費）だけを読む窓口（f3-4）。お店は合言葉かテストの印から決め、画面が名乗った番号は受け取らない。読むだけ。';

revoke all on function public.keiri_tenant_payments(text, date, date, text) from public;
grant execute on function public.keiri_tenant_payments(text, date, date, text)
  to anon, authenticated, service_role;


-- ============================================================
-- ⑫ のこりの棚（経理の設定・金庫の記録・数えない印・立替（現場））を、
--    よその店ぶんだけ公開の鍵では読めないようにする（f3-4／2026-10-18 追記）
--
--   これを流すと：**日報いがいの棚が、ぜんぶ お店ごとに分かれます。**
--   ＝ 仕上げ表の f3-4（よその店のデータが見えないか）が、この1枚で閉じます。
--
-- ■ なぜ4つまとめてなのか（2026-10-18・B）
--   ⑧（日報）・⑩（立替（経営））・⑪（払った記録）は、**中身が入っている棚**なので
--   1つずつ出しました。のこりの4つは **どのお店の行も1行も入っていません**
--   （2026-10-18 に外から数えて確認：経理の設定も立替（現場）も 印つき0行、
--     金庫の記録と数えない印はこの貼り紙で作られる新しい棚）。
--   入っていない棚は、締めても失うものがありません。
--   ★ここを残すと、**2軒目のお店に数字が入った瞬間に公開の鍵で読めます**。
--     先に閉めておくのが、いちばん安全で、じゅんの手も1回で済みます。
--
-- ■ 手羽屋は1行も変わりません（ここが大事）
--   手羽屋の行は**印が空（null）**です。足す決まりは
--   「**印が空の行だけ 読んでよい**」なので、じゅんが見る画面は1行も変わりません。
--   書き込みも今までどおりです（足す決まりは**読むときだけ**に効きます）。
--
-- ■ 足すだけ・消しません（やり方は⑧⑩⑪と同じ）
--   いまある「だれでもOK」の決まりは**触りません**。追い禁止（restrictive）の
--   決まりを棚ごとに1本 足し、その棚の**倉庫の窓口**を対で作ります。
--   ★元に戻すのは4行です：
--     drop policy "keiri_only_tebaya_settings_readable"         on public.keiri_settings;
--     drop policy "keiri_only_tebaya_cash_events_readable"      on public.keiri_cash_events;
--     drop policy "keiri_only_tebaya_expense_ignores_readable"  on public.keiri_expense_ignores;
--     drop policy "keiri_only_tebaya_advance_expenses_readable" on public.keiri_advance_expenses;
-- ============================================================
-- (a) 棚ごとに「印が空の行だけ 読んでよい」という追い禁止の決まりを1本ずつ 足す
do $$
begin
  if not exists (
       select 1 from information_schema.tables
        where table_schema = 'public' and table_name = 'keiri_settings'
     ) then
    raise notice '⑫ 経理の設定の棚がありませんでした（何もしていません）';
  elsif exists (
       select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'keiri_settings'
          and policyname = 'keiri_only_tebaya_settings_readable'
     ) then
    raise notice '⑫ 経理の設定の読む決まりは、もうありました（何もしていません）';
  else
    create policy "keiri_only_tebaya_settings_readable" on public.keiri_settings
      as restrictive for select to public
      using (tenant_id is null);
    raise notice '⑫ よその店の経理の設定を、公開の鍵では読めないようにしました（手羽屋の行＝印が空は今までどおり）';
  end if;
end $$;

do $$
begin
  if not exists (
       select 1 from information_schema.tables
        where table_schema = 'public' and table_name = 'keiri_cash_events'
     ) then
    raise notice '⑫ 金庫の記録の棚がありませんでした（何もしていません）';
  elsif exists (
       select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'keiri_cash_events'
          and policyname = 'keiri_only_tebaya_cash_events_readable'
     ) then
    raise notice '⑫ 金庫の記録の読む決まりは、もうありました（何もしていません）';
  else
    create policy "keiri_only_tebaya_cash_events_readable" on public.keiri_cash_events
      as restrictive for select to public
      using (tenant_id is null);
    raise notice '⑫ よその店の金庫の記録を、公開の鍵では読めないようにしました（手羽屋の行＝印が空は今までどおり）';
  end if;
end $$;

do $$
begin
  if not exists (
       select 1 from information_schema.tables
        where table_schema = 'public' and table_name = 'keiri_expense_ignores'
     ) then
    raise notice '⑫ 「この支払いは数えない」の印の棚がありませんでした（何もしていません）';
  elsif exists (
       select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'keiri_expense_ignores'
          and policyname = 'keiri_only_tebaya_expense_ignores_readable'
     ) then
    raise notice '⑫ 「この支払いは数えない」の印の読む決まりは、もうありました（何もしていません）';
  else
    create policy "keiri_only_tebaya_expense_ignores_readable" on public.keiri_expense_ignores
      as restrictive for select to public
      using (tenant_id is null);
    raise notice '⑫ よその店の「この支払いは数えない」の印を、公開の鍵では読めないようにしました（手羽屋の行＝印が空は今までどおり）';
  end if;
end $$;

do $$
begin
  if not exists (
       select 1 from information_schema.tables
        where table_schema = 'public' and table_name = 'keiri_advance_expenses'
     ) then
    raise notice '⑫ 立替（現場）の棚がありませんでした（何もしていません）';
  elsif exists (
       select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'keiri_advance_expenses'
          and policyname = 'keiri_only_tebaya_advance_expenses_readable'
     ) then
    raise notice '⑫ 立替（現場）の読む決まりは、もうありました（何もしていません）';
  else
    create policy "keiri_only_tebaya_advance_expenses_readable" on public.keiri_advance_expenses
      as restrictive for select to public
      using (tenant_id is null);
    raise notice '⑫ よその店の立替（現場）を、公開の鍵では読めないようにしました（手羽屋の行＝印が空は今までどおり）';
  end if;
end $$;

-- (b) よその店が、自分のぶんだけを読むための「倉庫の窓口」を棚ごとに1つ
--
--   ★どれも⑧⑩⑪と同じ決まりです：
--     ・お店は**合言葉（戻せない形・16進64文字）**か**テストの印**から決める
--     ・画面やブラウザが名乗った「お店の番号」は**受け取りません**
--     ・当たったお店が1軒でないときは**何も返しません**
--     ・お店の名前・合言葉・連絡先・レシート写真の住所は1文字も返しません

-- 経理の設定：お店が1軒につき1行（数え始めの日・そのときの現金・外注費の率・家賃）。期間では絞りません
create or replace function public.keiri_tenant_settings(
  p_password_hash text default null,
  p_from date default null,
  p_to date default null,
  p_test_mark text default null
)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_n int;
begin
  if p_test_mark is not null and btrim(p_test_mark) <> '' then
    if btrim(p_test_mark) !~ '^test-' then
      return;
    end if;
    select count(*) into v_n
      from public.keiri_tenants t
     where t.external_session_id = btrim(p_test_mark)
       and coalesce(t.shop_name, '') like '【テスト】%';
    if v_n <> 1 then
      return;
    end if;
    select t.id into v_tenant
      from public.keiri_tenants t
     where t.external_session_id = btrim(p_test_mark)
       and coalesce(t.shop_name, '') like '【テスト】%'
     limit 1;
  else
    if p_password_hash is null or btrim(lower(p_password_hash)) !~ '^[0-9a-f]{64}$' then
      return;
    end if;
    select count(*) into v_n
      from public.keiri_tenants t
     where t.admin_password_hash = btrim(lower(p_password_hash))
       and t.status = 'active';
    if v_n <> 1 then
      return;
    end if;
    select t.id into v_tenant
      from public.keiri_tenants t
     where t.admin_password_hash = btrim(lower(p_password_hash))
       and t.status = 'active'
     limit 1;
  end if;

  if v_tenant is null then
    return;
  end if;

  return query
    select to_jsonb(x)
      from (
        select s.opening_date,
               s.opening_balance,
               s.outsourcing_rate,
               s.monthly_rent,
               s.rent_start_month,
               s.memo
          from public.keiri_settings s
         where s.tenant_id = v_tenant
      ) x;
end $$;

comment on function public.keiri_tenant_settings(text, date, date, text) is
  '経理：よその店が自分の経理の設定だけを読む窓口（f3-4）。お店は合言葉かテストの印から決め、画面が名乗った番号は受け取らない。読むだけ。';

revoke all on function public.keiri_tenant_settings(text, date, date, text) from public;
grant execute on function public.keiri_tenant_settings(text, date, date, text)
  to anon, authenticated, service_role;

-- 金庫の記録：金庫を数えた記録と、銀行に入れた記録
create or replace function public.keiri_tenant_cash_events(
  p_password_hash text default null,
  p_from date default null,
  p_to date default null,
  p_test_mark text default null
)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_n int;
begin
  if p_test_mark is not null and btrim(p_test_mark) <> '' then
    if btrim(p_test_mark) !~ '^test-' then
      return;
    end if;
    select count(*) into v_n
      from public.keiri_tenants t
     where t.external_session_id = btrim(p_test_mark)
       and coalesce(t.shop_name, '') like '【テスト】%';
    if v_n <> 1 then
      return;
    end if;
    select t.id into v_tenant
      from public.keiri_tenants t
     where t.external_session_id = btrim(p_test_mark)
       and coalesce(t.shop_name, '') like '【テスト】%'
     limit 1;
  else
    if p_password_hash is null or btrim(lower(p_password_hash)) !~ '^[0-9a-f]{64}$' then
      return;
    end if;
    select count(*) into v_n
      from public.keiri_tenants t
     where t.admin_password_hash = btrim(lower(p_password_hash))
       and t.status = 'active';
    if v_n <> 1 then
      return;
    end if;
    select t.id into v_tenant
      from public.keiri_tenants t
     where t.admin_password_hash = btrim(lower(p_password_hash))
       and t.status = 'active'
     limit 1;
  end if;

  if v_tenant is null then
    return;
  end if;

  return query
    select to_jsonb(x)
      from (
        select c.id,
               c.kind,
               c.happened_on,
               c.amount,
               c.actor,
               c.note
          from public.keiri_cash_events c
         where c.tenant_id = v_tenant
           and (p_from is null or c.happened_on >= p_from)
           and (p_to is null or c.happened_on <= p_to)
         order by c.happened_on
      ) x;
end $$;

comment on function public.keiri_tenant_cash_events(text, date, date, text) is
  '経理：よその店が自分の金庫の記録だけを読む窓口（f3-4）。お店は合言葉かテストの印から決め、画面が名乗った番号は受け取らない。読むだけ。';

revoke all on function public.keiri_tenant_cash_events(text, date, date, text) from public;
grant execute on function public.keiri_tenant_cash_events(text, date, date, text)
  to anon, authenticated, service_role;

-- 「この支払いは数えない」の印：同じ支払いが2か所にあるときの「こちらは数えない」の印
create or replace function public.keiri_tenant_expense_ignores(
  p_password_hash text default null,
  p_from date default null,
  p_to date default null,
  p_test_mark text default null
)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_n int;
begin
  if p_test_mark is not null and btrim(p_test_mark) <> '' then
    if btrim(p_test_mark) !~ '^test-' then
      return;
    end if;
    select count(*) into v_n
      from public.keiri_tenants t
     where t.external_session_id = btrim(p_test_mark)
       and coalesce(t.shop_name, '') like '【テスト】%';
    if v_n <> 1 then
      return;
    end if;
    select t.id into v_tenant
      from public.keiri_tenants t
     where t.external_session_id = btrim(p_test_mark)
       and coalesce(t.shop_name, '') like '【テスト】%'
     limit 1;
  else
    if p_password_hash is null or btrim(lower(p_password_hash)) !~ '^[0-9a-f]{64}$' then
      return;
    end if;
    select count(*) into v_n
      from public.keiri_tenants t
     where t.admin_password_hash = btrim(lower(p_password_hash))
       and t.status = 'active';
    if v_n <> 1 then
      return;
    end if;
    select t.id into v_tenant
      from public.keiri_tenants t
     where t.admin_password_hash = btrim(lower(p_password_hash))
       and t.status = 'active'
     limit 1;
  end if;

  if v_tenant is null then
    return;
  end if;

  return query
    select to_jsonb(x)
      from (
        select i.id,
               i.source,
               i.ref_id,
               i.line_index,
               i.amount,
               i.paid_on,
               i.reason,
               i.marked_by,
               i.undone_at
          from public.keiri_expense_ignores i
         where i.tenant_id = v_tenant
           and (p_from is null or i.paid_on >= p_from)
           and (p_to is null or i.paid_on <= p_to)
         order by i.paid_on
      ) x;
end $$;

comment on function public.keiri_tenant_expense_ignores(text, date, date, text) is
  '経理：よその店が自分の「この支払いは数えない」の印だけを読む窓口（f3-4）。お店は合言葉かテストの印から決め、画面が名乗った番号は受け取らない。読むだけ。';

revoke all on function public.keiri_tenant_expense_ignores(text, date, date, text) from public;
grant execute on function public.keiri_tenant_expense_ignores(text, date, date, text)
  to anon, authenticated, service_role;

-- 立替（現場）：現場のスタッフが自分のお金で立て替えた記録。レシート写真の住所は返しません
create or replace function public.keiri_tenant_advance_expenses(
  p_password_hash text default null,
  p_from date default null,
  p_to date default null,
  p_test_mark text default null
)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_n int;
begin
  if p_test_mark is not null and btrim(p_test_mark) <> '' then
    if btrim(p_test_mark) !~ '^test-' then
      return;
    end if;
    select count(*) into v_n
      from public.keiri_tenants t
     where t.external_session_id = btrim(p_test_mark)
       and coalesce(t.shop_name, '') like '【テスト】%';
    if v_n <> 1 then
      return;
    end if;
    select t.id into v_tenant
      from public.keiri_tenants t
     where t.external_session_id = btrim(p_test_mark)
       and coalesce(t.shop_name, '') like '【テスト】%'
     limit 1;
  else
    if p_password_hash is null or btrim(lower(p_password_hash)) !~ '^[0-9a-f]{64}$' then
      return;
    end if;
    select count(*) into v_n
      from public.keiri_tenants t
     where t.admin_password_hash = btrim(lower(p_password_hash))
       and t.status = 'active';
    if v_n <> 1 then
      return;
    end if;
    select t.id into v_tenant
      from public.keiri_tenants t
     where t.admin_password_hash = btrim(lower(p_password_hash))
       and t.status = 'active'
     limit 1;
  end if;

  if v_tenant is null then
    return;
  end if;

  return query
    select to_jsonb(x)
      from (
        select a.id,
               a.expense_date,
               a.payer,
               a.amount,
               a.source_type,
               a.memo
          from public.keiri_advance_expenses a
         where a.tenant_id = v_tenant
           and (p_from is null or a.expense_date >= p_from)
           and (p_to is null or a.expense_date <= p_to)
         order by a.expense_date
      ) x;
end $$;

comment on function public.keiri_tenant_advance_expenses(text, date, date, text) is
  '経理：よその店が自分の立替（現場）だけを読む窓口（f3-4）。お店は合言葉かテストの印から決め、画面が名乗った番号は受け取らない。読むだけ。';

revoke all on function public.keiri_tenant_advance_expenses(text, date, date, text) from public;
grant execute on function public.keiri_tenant_advance_expenses(text, date, date, text)
  to anon, authenticated, service_role;


-- ============================================================
-- 確かめ方（流したあと、これを貼ると結果が1画面で見えます）
--
--   select 'keiri_cash_events'    as 棚, count(*) as 行数 from public.keiri_cash_events
--   union all
--   select 'keiri_expense_ignores', count(*) from public.keiri_expense_ignores
--   union all
--   select '日報（印がついている行）', count(tenant_id) from public.daily_reports
--   union all
--   select '立替・古い棚（印がついている行）', count(tenant_id) from public.advance_expenses;
--
--   → 新しい2つの棚は 0行（まだ何も入れていないので正しい）。
--   → 日報と立替の「印がついている行」も 0 のまま＝手羽屋のデータは今までどおり。
--
--   写真の印が付いたかは、これで分かります：
--   select count(*) as 日報, sum(receipt_count) as 写真つきの経費の行
--   from keiri_reports;
--
--   ⑤の欄が付いたかは、これで分かります（2026-10-08 追記）：
--   select count(tenant_id) as シフトの印がついている行 from public.shifts;
--   → 0 のまま＝手羽屋のシフトは今までどおりです（欄ができただけ）。
--
--   ⑥のテストの店ができたかは、これで分かります（2026-10-09 追記）：
--   select shop_name as 店名, status as 状態,
--          activated_at - created_at as かかった時間
--     from public.keiri_tenants
--    where external_session_id = 'test-b2-kensa-1006';
--   → 状態が active・かかった時間が1秒未満なら、手順1〜3まで通っています。
--   → 本番の https://tebaya-report.vercel.app/api/keiri/tenant-trial を開くと、
--     こちら側からも確かめられます（サーバー側の鍵が壊れていても出ます）。
--   ⑦ 日報の古い控えに鍵が付いたかは、これで分かります（2026-10-13 追記）：
--   select relname as 控えの名前, relrowsecurity as 鍵がかかっているか,
--          (select count(*) from pg_policies p where p.tablename = c.relname) as 決まりの本数
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relname like 'daily\_reports\_backup%';
--   → 鍵がかかっているか＝true・決まりの本数＝0 なら正しい形です
--     （サーバー側の鍵と、この SQL Editor からだけ読めます。中身は13行のまま減りません）。
--   → 本番の https://tebaya-report.vercel.app/api/keiri/shelves の⑦が
--     「流れています」になります。
--
--   ⑧ よその店の日報が公開の鍵で読めなくなったかは、これで分かります（2026-10-15 追記）：
--   select count(*) as 読む決まりの本数
--     from pg_policies
--    where schemaname = 'public' and tablename = 'daily_reports'
--      and policyname = 'keiri_only_tebaya_rows_readable';
--   → 1 なら付いています。手羽屋の行が今までどおり読めることは、これで分かります：
--   select count(*) as 手羽屋の行, count(tenant_id) as 印がついている行
--     from public.daily_reports;
--   → 「手羽屋の行」が今までと同じ数・「印がついている行」が 0 なら、見え方は変わっていません
--     （印が付いた行＝よその店の行は、公開の鍵では読めなくなります。
--       その店が自分の数字を読むのは⑧の窓口ごしです）。
--   → 本番の https://tebaya-report.vercel.app/api/keiri/copies を開くと、
--     「よその店の行が、公開の鍵で見えるか」が日本語で出ます（こちら側から確かめられます）。
--
--   ⑩ 立替（経営）が締まったかは、これで分かります（2026-10-17 追記）：
--   select count(*) as 読む決まりの本数
--     from pg_policies
--    where schemaname = 'public' and tablename = 'advance_expenses'
--      and policyname = 'keiri_only_tebaya_advances_readable';
--   → 1 なら付いています。手羽屋の立替が今までどおり読めることは、これで分かります：
--   select count(*) as 立替の行, count(tenant_id) as 印がついている行
--     from public.advance_expenses;
--   → 「立替の行」が今までと同じ数（51前後）・「印がついている行」が 0 なら、
--     じゅんが見る画面（/cash・/cash/advances・/sales-report・経理）は1行も変わっていません。
--   → 本番の https://tebaya-report.vercel.app/api/keiri/copies の
--     「日報いがいの棚」で、立替（経営）が○になります。
--
--   ⑪ 払った記録が締まったかは、これで分かります（2026-10-18 追記）：
--   select count(*) as 読む決まりの本数
--     from pg_policies
--    where schemaname = 'public' and tablename = 'keiri_payments'
--      and policyname = 'keiri_only_tebaya_payments_readable';
--   → 1 なら付いています。手羽屋の払った記録が今までどおり読めることは、これで分かります：
--   select count(*) as 払った記録の行, count(tenant_id) as 印がついている行
--     from public.keiri_payments;
--   → 「払った記録の行」が今までと同じ数・「印がついている行」が 0 なら、
--     じゅんが見る経理画面（/keiri の「まだ払っていないお金」「払った記録」）は
--     1行も変わっていません。
--   → 本番の https://tebaya-report.vercel.app/api/keiri/copies の
--     「日報いがいの棚」で、払った記録が○になります。
--
--   ⑫ のこりの4つが締まったかは、これで分かります（2026-10-18 追記）：
--   select tablename as 棚, count(*) as 読む決まりの本数
--     from pg_policies
--    where schemaname = 'public'
--      and policyname in ('keiri_only_tebaya_settings_readable',
--                         'keiri_only_tebaya_cash_events_readable',
--                         'keiri_only_tebaya_expense_ignores_readable',
--                         'keiri_only_tebaya_advance_expenses_readable')
--    group by tablename;
--   → 4棚ぶん 1 ずつ出れば付いています。手羽屋の行が今までどおり読めることは、これで分かります：
--   select 'keiri_settings' as 棚, count(*) as 行, count(tenant_id) as 印がついている行
--     from public.keiri_settings
--   union all
--   select 'keiri_advance_expenses', count(*), count(tenant_id) from public.keiri_advance_expenses;
--   → 「印がついている行」が 0 なら、じゅんが見る画面は1行も変わっていません。
--   → 本番の https://tebaya-report.vercel.app/api/keiri/copies の
--     「日報いがいの棚」が**6つぜんぶ○**になり、f3-4 がここで閉じます。
-- ============================================================
