-- ============================================================
-- 経理層（keiri_）STEP2：業態別 勘定科目マッピングテーブル
-- ============================================================
-- これは「日報のデータ → 会計の仕訳（しわけ）」に置き換えるための"辞書"です。
--
--   例）日報の経費に「場代 3,000円」と書かれていたら
--       → 勘定科目「賃借料」／税区分「課税仕入10%」の仕訳にする
--
-- ── 重要な前提（絶対に変えないこと）────────────────────────
-- ★ このアプリは会計ソフトではありません。freee・マネーフォワードの
--    競合ではなく「連携先」です。出口はマネーフォワード クラウド会計の
--    仕訳インポートCSVです。
-- ★ このアプリは税務判断をしません／させません。
--    ここに入っている勘定科目・税区分は、あくまで税理士に見てもらうための
--    「叩き台（下書き）」です。最終確定は必ず税理士のレビューで行います。
--    理由：税務判断は税理士の独占業務であり、このアプリが提供できる範囲は
--          「記帳の効率化」までだからです。
--    判断が割れそうなものには needs_tax_advisor_review = true を立てて、
--    人間（税理士）に必ず目を通してもらいます。
-- ★ 既存テーブルの変更・削除はしません。追加のみです。
-- ────────────────────────────────────────────────

create table if not exists public.keiri_account_mapping (
  id bigint generated always as identity primary key,

  -- 業態コード。手羽屋＝'tebaya'。将来ほかの業態を足すときはここを分ける
  business_type_code text not null default 'tebaya',

  -- 現場データの種類。日報や立替経費フォームの「種類」がこれに対応する
  source_type text not null,

  -- 画面に出す日本語のラベル（スタッフが選ぶときに見る文字）
  label text not null,

  -- 勘定科目（会計ソフトに渡す科目名）
  -- NULL＝「内容に応じて決まる」もの（立替経費など、支払方法だけを表す行）
  account_title text,

  -- 補助科目（任意）
  sub_account text,

  -- 税区分（マネーフォワード クラウド会計の表記に合わせた文字列）
  -- ※これは税理士確認前の叩き台です
  tax_category text not null,

  -- 借方／貸方の別。'debit'＝借方（費用など） / 'credit'＝貸方（売上など）
  entry_side text not null check (entry_side in ('debit', 'credit')),

  -- 相手勘定（この仕訳のもう片方）。例：立替経費なら「未払金」
  -- NULL＝次ステージの変換処理で決める
  counter_account text,

  -- 相手勘定を「立替者ごと」に分けるか（未払金／立替者：緒方 のように分ける）
  counter_account_by_payer boolean not null default false,

  -- 要税理士確認フラグ。true＝判断が割れるので必ず税理士に確認する
  needs_tax_advisor_review boolean not null default false,

  -- 表示順・有効フラグ
  sort_order integer not null default 0,
  is_active boolean not null default true,

  -- 補足メモ（なぜこの科目にしたか等）
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 同じ業態で同じ source_type は1つだけ（初期データを何度流しても増えない）
  constraint keiri_account_mapping_business_source_key
    unique (business_type_code, source_type)
);

comment on table public.keiri_account_mapping is
  '経理層：業態別の勘定科目マッピング（現場データ→仕訳の辞書）。'
  '科目・税区分は税理士確認前の叩き台であり、アプリは税務判断を行わない。';
comment on column public.keiri_account_mapping.source_type is
  '現場データの種類。日報の経費や立替経費フォームの「種類」がこれに対応する。';
comment on column public.keiri_account_mapping.account_title is
  '勘定科目。NULL は「内容に応じた科目を使う」の意味（立替経費など支払方法だけを表す行）。';
comment on column public.keiri_account_mapping.tax_category is
  '税区分（叩き台）。最終確定は税理士のレビューで行う。アプリは税務判断をしない。';
comment on column public.keiri_account_mapping.needs_tax_advisor_review is
  'true＝判断が割れるので必ず税理士に確認する項目（例：業務委託の歩合報酬）。';
comment on column public.keiri_account_mapping.counter_account_by_payer is
  'true＝相手勘定を立替者ごとに分ける（未払金／立替者別）。';

create index if not exists idx_keiri_account_mapping_lookup
  on public.keiri_account_mapping (business_type_code, is_active, sort_order);

-- 既存テーブルと同じく anon クライアントから利用する
grant select, insert, update, delete on public.keiri_account_mapping to anon, authenticated;

alter table public.keiri_account_mapping enable row level security;
drop policy if exists "keiri_account_mapping_all_public" on public.keiri_account_mapping;
create policy "keiri_account_mapping_all_public" on public.keiri_account_mapping
  for all using (true) with check (true);

-- ============================================================
-- 手羽屋テンプレ（初期データ）
-- ============================================================
-- ★ 再掲：ここの科目・税区分はすべて「税理士に見てもらうための叩き台」です。
--    アプリはこの通りに仕訳の下書きを作るだけで、正しさの判断はしません。
insert into public.keiri_account_mapping
  (business_type_code, source_type, label, account_title, sub_account, tax_category,
   entry_side, counter_account, counter_account_by_payer, needs_tax_advisor_review, sort_order, note)
values
  -- ── 売上 ──
  ('tebaya', 'sales_cash', '売上・現金（テイクアウト飲食料品）',
   '売上高', null, '課税売上8%（軽減税率）',
   'credit', null, false, false, 10,
   'テイクアウトの飲食料品なので軽減税率8%の想定。店内飲食があれば10%になるため要確認。'),

  ('tebaya', 'sales_cashless', '売上・キャッシュレス（PayPay等）',
   '売上高', null, '課税売上8%（軽減税率）',
   'credit', null, false, false, 20,
   '手羽屋の売上は現時点で全額が現金のため使用しない（別マイグレーションで is_active = false）。'
   'キャッシュレス決済を導入したら有効に戻して使う。'),

  -- ── 仕入 ──
  ('tebaya', 'purchase_chicken', '仕入・鶏肉',
   '仕入高', '鶏肉', '課税仕入8%（軽減税率）',
   'debit', null, false, false, 30, null),

  ('tebaya', 'purchase_gyoza', '仕入・餃子材料',
   '仕入高', '餃子材料', '課税仕入8%（軽減税率）',
   'debit', null, false, false, 40, null),

  ('tebaya', 'purchase_seasoning', '仕入・粉/油/調味料',
   '仕入高', '粉・油・調味料', '課税仕入8%（軽減税率）',
   'debit', null, false, false, 50, null),

  -- ── 経費 ──
  ('tebaya', 'supplies', '容器・袋・割り箸などの消耗品',
   '消耗品費', null, '課税仕入10%',
   'debit', null, false, false, 60,
   '食べ物ではないので軽減税率の対象外（10%）の想定。'),

  ('tebaya', 'booth_fee', '出店料（スーパー等の場所代）',
   '賃借料', null, '課税仕入10%',
   'debit', null, false, false, 70,
   '日報の経費に「場代」として一番多く出てくる項目。'),

  ('tebaya', 'fuel_toll', 'ガソリン・高速代',
   '旅費交通費', null, '課税仕入10%',
   'debit', null, false, false, 80, null),

  ('tebaya', 'payroll_parttime', 'バイト給与',
   '給料手当', null, '対象外',
   'debit', null, false, false, 90,
   '給与は消費税の対象外。'),

  ('tebaya', 'outsourcing_commission', '業務委託の歩合報酬',
   '外注費', null, '課税仕入10%',
   'debit', null, false, true, 100,
   '★要税理士確認：給与（給料手当・対象外）とみなされるか、外注費（課税仕入10%）とみなされるかは'
   '実態で判断が割れる。アプリでは判断しないので必ず税理士に確認すること。'),

  ('tebaya', 'tool_server', 'ツール・サーバー代',
   '通信費', null, '課税仕入10%',
   'debit', null, false, false, 110, null),

  -- ── 支払方法の指定（科目そのものではない行）──
  ('tebaya', 'advance_expense', '立替経費',
   null, null, '対象外',
   'debit', '未払金', true, false, 120,
   'これは「誰かが自分のお金で先に払った」ことを表す行。'
   '勘定科目は立て替えた内容に応じて別の行（仕入高・消耗品費など）を使い、'
   'この行は相手勘定を「未払金（立替者別）」にする指定として使う。'
   '税区分は相手勘定側のもの（＝未払金なので対象外）。')

on conflict (business_type_code, source_type) do update set
  label                    = excluded.label,
  account_title            = excluded.account_title,
  sub_account              = excluded.sub_account,
  tax_category             = excluded.tax_category,
  entry_side               = excluded.entry_side,
  counter_account          = excluded.counter_account,
  counter_account_by_payer = excluded.counter_account_by_payer,
  needs_tax_advisor_review = excluded.needs_tax_advisor_review,
  sort_order               = excluded.sort_order,
  note                     = excluded.note,
  updated_at               = now();
