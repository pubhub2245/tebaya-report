-- ============================================================
-- 経理パッケージ「お申し込み」の控え
-- 作成：2026-09-19（司令室B）／kp50
--
-- ■ 何をする SQL か（やさしい説明）
--   経理パッケージの申し込みフォーム（/keiri/apply）に届いた内容を、
--   1件1行で控えておくための**新しい棚**を1つ作ります。
--   ※ **既存の表は1つも触りません。**足すだけです。
--
-- ■ 手羽屋はどうなるか
--   何も変わりません。日報・シフト・レジ・LINE・お金の計算とは無関係の棚です。
--
-- ■ 無くても動きます（順番の縛りがありません）
--   申し込みが入ると、アプリはまずスタッフの LINE グループへ知らせます。
--   この棚がまだ無い間は、控えだけが静かに失敗して知らせだけが届きます。
--   この SQL を流したあとは、何も直さなくても控えも残るようになります。
--   ＝**アプリを先に出しても、SQL を先に流しても、どちらでも壊れません。**
--
-- ■ 実行しても安全か
--   何度実行しても同じ結果です（create table if not exists）。
-- ============================================================

create table if not exists public.keiri_applications (
  id uuid primary key default gen_random_uuid(),

  -- 申し込んだお店と、折り返しの宛先
  shop_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  note text,

  -- どこから来た申し込みか（form＝サイトのフォーム）
  source text not null default 'form',

  -- 状態：new＝まだ折り返していない ／ contacted＝連絡ずみ ／
  --       won＝申し込みになった ／ lost＝見送り
  status text not null default 'new',

  -- 実際に使い始めたお店の行（keiri_tenants）に繋がったときだけ入る
  tenant_id uuid references public.keiri_tenants (id),

  created_at timestamptz not null default now()
);

comment on table public.keiri_applications is
  '経理パッケージのお申し込み（/keiri/apply）の控え。連絡先が入るので、ブラウザから直接は読ませない。';

-- 新しい順に取り出すための索引（速さのためだけ・意味は変えない）
create index if not exists keiri_applications_created_idx
  on public.keiri_applications (created_at desc);

-- 鍵（RLS）は keiri_tenants と同じ方針にする。
-- ポリシーを付けない＝サーバー側の合鍵（service_role）だけが読み書きできる状態。
-- 連絡先が入るので、ブラウザから直接触らせない。
alter table public.keiri_applications enable row level security;

-- ------------------------------------------------------------------
-- 確かめ方（実行後に貼ると、棚ができていることと、既存の行が動いていないことが分かる）
--
--   select count(*) as 申し込みの件数 from public.keiri_applications;
--   → 作った直後は 0 件です。
--
--   select count(*) as 日報の件数 from public.daily_reports;
--   → 実行の前後で変わりません（この SQL は既存の表を触っていないため）。
-- ------------------------------------------------------------------
