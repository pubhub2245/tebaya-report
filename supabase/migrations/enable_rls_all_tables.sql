-- ============================================================
-- 全テーブルで RLS（行レベルセキュリティ）を有効にする
-- ============================================================
-- RLS＝テーブルごとの「鍵」の仕組み。Supabaseの診断で
-- 16テーブルが「鍵なし（ERROR）」と判定されていたので、全部に鍵をかける。
--
-- ★ここで入れるポリシーは、いまのアプリと同じ「全員OK」の内容です。
--   つまり **この時点ではまだ実質的な制限にはなりません**。
--   目的は、鍵をかける仕組みを全テーブルに用意して、
--   次の段階（書き込みをサーバー側に寄せて anon から締め出す）に進めるようにすること。
--   いま制限を強くすると、ブラウザから直接読み書きしている今のアプリが動かなくなります。
--
-- ※ table_snapshots（バックアップ）だけは「ポリシー無し」のまま。
--   これは正しい状態で、service_role だけが触れる＝バックアップ自体が守られる。
--
-- 既存テーブルの列や中身は一切変更しない（鍵の設定だけ）。

do $$
declare
  t text;
  tables text[] := array[
    'daily_reports', 'cash_settings', 'feedback_box', 'feedback_replies',
    'advance_expenses', 'sale_products', 'agenda_items', 'venue_inquiries',
    'monthly_limited_products', 'prep_reports', 'prep_products', 'prep_settings',
    'prep_sessions', 'prep_session_items', 'prep_carryovers'
  ];
begin
  foreach t in array tables loop
    if exists (select 1 from pg_class where relname = t and relnamespace = 'public'::regnamespace) then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', t || '_all_public', t);
      execute format(
        'create policy %I on public.%I for all using (true) with check (true)',
        t || '_all_public', t);
    end if;
  end loop;
end $$;
