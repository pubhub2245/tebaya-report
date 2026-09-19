-- ============================================================
-- 訪問の棚（site_visits）を「入れることだけ許す」ポストにする
--   2026-09-19 B（kp84）／実行は Supabase の SQL Editor から
-- ============================================================
--
-- ■ これが何をするか（やさしい説明）
--   いま site_visits は鍵（RLS）が掛かっていて決まりが1つも無いため、
--   **サーバー側の合鍵（いま壊れている・kp55）以外は1行も書けません**。
--   そのせいで、5つのサイトの訪問が どれ1つ数えられていません（直近7日 0行）。
--   ここでは「**入れることだけ**許す」決まりを1つ足します。
--   読み出し（select）・書き換え（update）・消す（delete）は**許しません**。
--   ＝入れた中身を外から見ることはできない、郵便ポストの形です。
--
-- ■ 個人情報は入りません
--   この棚の列は site / path / campaign / ref_host / at の5つだけで、
--   名前・メール・電話・IP・ブラウザの種類が入る場所がそもそもありません。
--
-- ■ 元に戻せます
--   棚は消さず作り替えもせず、決まりを1つ足すだけです。
--   鍵（kp55）が直ったら、いちばん下の「戻し方」をそのまま実行してください。
--
-- ■ 手羽屋の日報・シフト・レジ・LINE・お金の計算には一切触れていません。
-- ■ 何度実行しても同じ結果になります。
-- ------------------------------------------------------------

alter table public.site_visits enable row level security;

-- 入れるのに要る権限だけを渡す（読み出しの権限は渡さない）
grant insert on table public.site_visits to anon, authenticated;
grant usage, select on sequence public.site_visits_id_seq to anon, authenticated;

-- いたずらで変な行を増やされないように、入れてよい中身を絞る
drop policy if exists "site_visits_insert_only" on public.site_visits;
create policy "site_visits_insert_only"
  on public.site_visits
  for insert
  to anon, authenticated
  with check (
    -- 決まった5つのサイト名だけ
    site in ('playmiyazaki', 'ai-tools-navi', 'endo', 'mh-build-roadmap', 'keiri')
    -- ページ・合言葉・来た所は、長さの上限つき
    and length(path) between 1 and 512
    and (campaign is null or length(campaign) <= 128)
    and (ref_host is null or length(ref_host) <= 253)
    -- 時刻は既定（now()）のまま。過去や未来を勝手に入れさせない
    and at between now() - interval '5 minutes' and now() + interval '5 minutes'
  );

-- ------------------------------------------------------------
-- 確かめ方（実行後に1回だけ）
--   select count(*) from public.site_visits;              -- 表が在るか
--   select polname from pg_policy
--     where polrelid = 'public.site_visits'::regclass;    -- 決まりが1つだけか
--   → そのあと本番のページを1回開いて、件数が増えるかを見る
--
-- 戻し方（kp55 の鍵が直ったら、これを実行して元に戻す）
--   drop policy if exists "site_visits_insert_only" on public.site_visits;
--   revoke all on table public.site_visits from anon, authenticated;
--   revoke all on sequence public.site_visits_id_seq from anon, authenticated;
-- ------------------------------------------------------------
