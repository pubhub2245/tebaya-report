-- 「写真そのものが埋め込まれたままの日報」を探すための関数。
--
-- ■ なぜ必要か
--   引っ越し（写真を置き場へ移す作業）をするとき、対象の日報だけを取り出したい。
--   ところが写真は日報の中の配列（jsonb）の奥に入っているため、
--   アプリ側からは「どの日報に写真が残っているか」を軽く調べる手段がない。
--   全部読み込むと18MBを毎回ダウンロードすることになる。
--   そこで「対象の日報のID・日付・枚数・容量」だけを返す関数をデータベース側に置く。
--
-- ■ 安全性
--   読み取り専用（stable）。呼び出した人の権限で動く（security invoker）。
--   実行できるのは service_role（サーバー側の処理）だけに限定する。
--   ブラウザの匿名キーからは呼べない。

create or replace function public.list_embedded_receipt_reports()
returns table (id uuid, report_date date, photo_count integer, bytes bigint)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select r.id,
         r.date,
         count(*)::int,
         sum(length(e->>'receipt_image_url'))::bigint
  from daily_reports r,
       lateral jsonb_array_elements(
         case when jsonb_typeof(r.expenses) = 'array' then r.expenses else '[]'::jsonb end
       ) e
  where e->>'receipt_image_url' like 'data:%'
  group by r.id, r.date
  order by r.date;
$$;

revoke all on function public.list_embedded_receipt_reports() from public;
revoke all on function public.list_embedded_receipt_reports() from anon;
revoke all on function public.list_embedded_receipt_reports() from authenticated;
grant execute on function public.list_embedded_receipt_reports() to service_role;
