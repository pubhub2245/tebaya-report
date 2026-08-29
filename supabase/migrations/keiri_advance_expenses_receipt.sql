-- ============================================================
-- 経理層：立替経費にレシート写真を追加
-- ============================================================
-- 立替経費フォーム（/keiri/advances）で撮ったレシート写真を保存する列。
-- 中身は "data:image/jpeg;base64,..." という文字列（写真を文字に変えたもの）。
-- 保存前に長辺1000px・画質70%まで小さくする（lib/imageResize.ts）。
-- 既存の advance_expenses.receipt_image_url と同じ方式に合わせている。
--
-- 追加のみ。既存テーブルの変更・削除はしない。

alter table public.keiri_advance_expenses
  add column if not exists receipt_image_url text;

comment on column public.keiri_advance_expenses.receipt_image_url is
  'レシート写真（データURL文字列・任意）。保存前に縮小する。';
