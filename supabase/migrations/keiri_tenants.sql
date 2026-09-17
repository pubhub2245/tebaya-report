-- ============================================================
-- 経理パッケージ「無人販売の入口③（自動初期設定）」用のテーブル
-- 作成：2026-09-17（司令室B）
--
-- ■ 何のための表か
--   経理パッケージを申し込んだ「お店1軒」を1行で表します。
--   支払いが終わった通知（Webhook）が届いたら、この表に1行できて、
--   そのお店専用の初回設定URLが発行されます。
--
-- ■ 手羽屋のデータは触りません
--   既存の keiri_settings / daily_reports は今のまま（1店舗前提）です。
--   この表に入るのは「これから申し込む他店」だけで、
--   手羽屋は tenant_id を持たない（= null）お店として今まで通り動きます。
--
-- ■ 実行はしていません
--   このファイルは設計どおりの SQL を置いただけです。
--   実際に倉庫（Supabase）へ流すのは、じゅんの「はい」のあとです。
-- ============================================================

create table if not exists public.keiri_tenants (
  id uuid primary key default gen_random_uuid(),

  -- お店の名前。申し込み直後は空（初回設定の画面で本人が入れる）
  shop_name text,

  -- 業態テンプレの種類。既定は汎用（generic）
  template text not null default 'generic',

  -- 初回設定の画面を開くための合言葉（URLに付ける長い文字列）
  setup_token text not null unique,

  -- 管理画面に入るための合言葉。そのままではなく、ハッシュ（戻せない形）で持つ
  -- 管理画面に入るための合言葉（戻せない形）。初回設定を終えた時に入る
  admin_password_hash text,

  -- 申し込みの出どころ（stripe / manual）と、その先の識別子
  source text not null default 'stripe',
  external_customer_id text,
  external_subscription_id text,
  -- 支払いの画面1回ぶんの番号。支払い後にこの番号を付けて初回設定の画面へ戻る
  external_session_id text,

  -- 状態：pending＝初回設定まだ ／ active＝使える ／ canceled＝解約
  status text not null default 'pending',

  created_at timestamptz not null default now(),
  activated_at timestamptz,

  -- 同じ通知が2回届いても1行にするための控え
  last_event_id text
);

-- 同じ支払い（同じお客さん・同じ定期課金）で二重に行ができないようにする
create unique index if not exists keiri_tenants_external_subscription_idx
  on public.keiri_tenants (external_subscription_id)
  where external_subscription_id is not null;

-- 経理の設定を「お店ごと」に持てるようにする列。
-- 既存の1行（手羽屋）は null のままなので、今の画面は何も変わりません。
alter table public.keiri_settings
  add column if not exists tenant_id uuid references public.keiri_tenants (id);

-- 鍵（RLS）は既存の方針に合わせて有効化する。
-- ポリシーは付けない＝サーバー側の合鍵（service_role）だけが読み書きできる状態。
-- 申し込み情報と合言葉なので、ブラウザから直接触らせない。
alter table public.keiri_tenants enable row level security;

-- 支払いのあと「?session=...」で戻ってきたときに、どのお店か引けるようにする
create unique index if not exists keiri_tenants_external_session_idx
  on public.keiri_tenants (external_session_id)
  where external_session_id is not null;
