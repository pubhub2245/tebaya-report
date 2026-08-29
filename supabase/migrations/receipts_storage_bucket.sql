-- レシート写真の置き場（Supabase Storage の receipts バケット）を使えるようにする
--
-- ■ なぜ引っ越すのか
--   これまでレシート写真は「日報のデータそのもの」の中に文字列として埋め込まれていた
--   （data:image/jpeg;base64,... という長い文字列）。写真つき12件で18MBあり、
--   日報を1件開くだけでも重く、毎日の控え（バックアップ）も同じだけ膨らむ。
--   写真は写真の置き場に置き、日報には「置き場の住所（URL）」だけを持たせる。
--
-- ■ ここでやること（追加のみ。既存テーブルは一切さわらない）
--   1) receipts バケットに「1枚あたりの上限」と「画像以外は受け付けない」制限を付ける
--   2) ブラウザから写真を"置ける"ようにする許可（INSERT）だけを与える
--
-- ■ 読み取りについて
--   receipts は公開バケットなので、URL を知っていれば写真は見られる。
--   ただし一覧を取得する許可（SELECT）は与えないため、
--   置いてある写真をまとめて覗くことはできない（住所はランダムな英数字）。
--   ※ このアプリは今のところブラウザが直接データベースを読み書きする作りのため、
--     日報の中身も同じ強さの守りになっている。ここだけ弱くなるわけではない。
--
-- ■ 上書き・削除の許可は与えない
--   一度置いた写真を、ブラウザ側から消したり差し替えたりはできない。
--   （消す必要が出たら管理者が Supabase の画面から行う）

-- 1) バケットの制限
update storage.buckets
set file_size_limit = 5242880,                                   -- 5MB/枚
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'receipts';

-- 2) 置く許可だけを与える
drop policy if exists receipts_insert on storage.objects;
create policy receipts_insert
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'receipts');
