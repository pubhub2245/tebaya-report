-- ============================================================
-- 経理層（keiri_）STEP3：立替経費テーブル
-- ============================================================
-- スタッフが自分のお金で先に払った経費を記録するテーブルです。
--
-- ★ 入力項目は5つだけ（日付／立替した人／金額／種類／メモ）。
--    理由：現場の入力負担を増やさないのが3層設計の大前提だからです。
--    項目を足したくなったら、勝手に足さずに必ず相談すること。
--
-- ★ このアプリは税務判断をしません。「種類」で選ばれた勘定科目・税区分は
--    keiri_account_mapping にある叩き台であり、最終確定は税理士のレビューで行います。
--
-- ※ 既存の advance_expenses テーブル（立替・精算の管理者向け画面 /cash/advances 用）とは
--    別物です。あちらは「誰にいくら返すか」を追う運用用、こちらは経理層の入口です。
--
-- TODO（次ステージ以降の候補）：レシート写真の添付。今回は作りません。
-- TODO（次ステージ）：ここのデータを keiri_account_mapping で仕訳に変換し、
--                     マネーフォワード クラウド会計の仕訳インポートCSVを出力する。

create table if not exists public.keiri_advance_expenses (
  id bigint generated always as identity primary key,

  -- 業態コード。入力画面には出さず 'tebaya' 固定（将来ほかの業態を足すときに使う）
  business_type_code text not null default 'tebaya',

  -- ① いつ立て替えたか
  expense_date date not null,

  -- ② 誰が立て替えたか（staff_members の名前）
  payer text not null,

  -- ③ いくら
  amount integer not null check (amount > 0),

  -- ④ 何の経費か（keiri_account_mapping.source_type から選ぶ）
  source_type text not null,

  -- ⑤ メモ（任意）
  memo text,

  created_at timestamptz not null default now(),

  -- 種類は必ずマッピング表にあるものだけ（辞書に無い種類が入らないようにする）
  constraint keiri_advance_expenses_source_type_fkey
    foreign key (business_type_code, source_type)
    references public.keiri_account_mapping (business_type_code, source_type)
);

comment on table public.keiri_advance_expenses is
  '経理層：立替経費。スタッフが自分のお金で先に払った経費の記録。入力は5項目のみ。';
comment on column public.keiri_advance_expenses.source_type is
  '経費の種類。keiri_account_mapping.source_type を参照し、勘定科目・税区分はそちらで決まる。';

create index if not exists idx_keiri_advance_expenses_date
  on public.keiri_advance_expenses (expense_date desc, id desc);
create index if not exists idx_keiri_advance_expenses_payer
  on public.keiri_advance_expenses (payer);

-- 既存テーブルと同じく anon クライアントから利用する
grant select, insert, update, delete on public.keiri_advance_expenses to anon, authenticated;

alter table public.keiri_advance_expenses enable row level security;
drop policy if exists "keiri_advance_expenses_all_public" on public.keiri_advance_expenses;
create policy "keiri_advance_expenses_all_public" on public.keiri_advance_expenses
  for all using (true) with check (true);
