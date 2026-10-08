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
--
-- ■ 安全について（ここが大事）
--   ・**足すだけ**です。消す・名前を変える・作り変えるものは1つもありません
--     （drop / delete / truncate は1行も入っていません）。
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
-- ============================================================
