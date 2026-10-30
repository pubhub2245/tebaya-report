#!/usr/bin/env bash
# ============================================================================
# 貼り紙（supabase/migrations/keiri_shelves_20261005.sql）の「下見」をする道具
#                                               （2026-10-13・B／f1-4・f3-4・f5-4）
#
# ■ これは何をするものか（やさしい説明）
#   じゅんが倉庫（Supabase）に1回 貼る貼り紙を、**貼る前に**こちら側で通してみます。
#   空っぽの倉庫をこのパソコンの中に1つ作り、本番と同じ形に組み立ててから、
#   同じ文を3回 続けて流します。止まる所があれば、ここで分かります。
#
#   仕上げの残り3つ（金庫の突き合わせ・お店ごとに分かれているか・2軒目を入れる手順）は
#   全部この1枚を待っています。流して初めて「途中で止まる」と分かると、
#   じゅんの2分が1回むだになり、気づくのは次の日です。だから先に通しておきます。
#
# ■ 使い方
#   bash tools/check-shelves-sql.sh
#   → 最後に「OK」か「NG」を出します。PostgreSQL が入っていなければ「飛ばしました」。
#
# ■ 大事な約束
#   ・**本番の倉庫には一切つなぎません。** このパソコンの中に作った空の倉庫だけを使います。
#   ・貼り紙の文は1文字も書き換えません（そのまま流すのが下見の意味）。
#   ・終わったら、作った倉庫は消します。
#
# ■ 本番とちがう所（正直に書いておく）
#   本番には、移行ファイル（supabase/migrations）に残っていない棚もあります
#   （シフト・出店場所など、画面から手で作ったもの）。それらは**あるものとして**
#   最小の形で作ってから流します。
# ============================================================================
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHEET="$ROOT/supabase/migrations/keiri_shelves_20261005.sql"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)}"
WORK="${WORK:-/var/lib/postgresql/shelves-dryrun}"
PORT="${PORT:-55432}"

if [ ! -x "$PGBIN/initdb" ]; then
  echo "飛ばしました：PostgreSQL がこのパソコンに入っていません（$PGBIN）"
  exit 0
fi
if [ "$(id -u)" != "0" ]; then
  echo "飛ばしました：倉庫を作るには管理者の権限が要ります"
  exit 0
fi

stop() { su postgres -c "$PGBIN/pg_ctl -D $WORK/data stop" >/dev/null 2>&1 || true; }
trap 'stop; rm -rf "$WORK"' EXIT

rm -rf "$WORK"; mkdir -p "$WORK/data" "$WORK/run"; chown -R postgres:postgres "$WORK"
su postgres -c "$PGBIN/initdb -D $WORK/data -U postgres -A trust" >"$WORK/initdb.log" 2>&1 || {
  echo "NG：空の倉庫を作れませんでした"; tail -3 "$WORK/initdb.log"; exit 1; }
su postgres -c "$PGBIN/pg_ctl -D $WORK/data -o \"-k $WORK/run -p $PORT -c listen_addresses=''\" -l $WORK/pg.log start" >/dev/null 2>&1
sleep 2

export PGHOST="$WORK/run" PGPORT="$PORT" PGUSER=postgres PGDATABASE=postgres
q() { psql -tA -q -c "$1"; }

# --- 本番と同じ形に組み立てる -------------------------------------------------
psql -q >/dev/null 2>&1 <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin;
SQL
psql -q -f "$ROOT/supabase/schema.sql" >/dev/null 2>&1
# 日報に expenses_total（本番にある列。移行ファイルは列がある前提で書かれている）
psql -q -c "alter table public.daily_reports add column if not exists expenses_total integer not null default 0" >/dev/null 2>&1
# 日報の unit_number（本番にある列。号車＝レジの持ち主。移行ファイルには残っていない）
psql -q -c "alter table public.daily_reports add column if not exists unit_number smallint" >/dev/null 2>&1
# 出店場所の棚（locations）を、**移行ファイルを流す前に**本番と同じ形で用意する。
#   ここが要るのは、2軒目を入れる手順の **手順4（そのお店の出店場所を1件 入れる）** を
#   下見でも通すためです（f5-4）。
#   2026-10-28 まで、下見の出店場所は `(id, name)` だけの最小の形で、
#   「どの店か」の印も鍵も無かったので、**手順4は一度も下見にかかっていませんでした。**
#   ＝ 貼り紙が流れたあとに手順4で止まっても、気づくのは じゅんの2分が済んだ後でした。
#
#   ※ 正直に書いておくこと：本番の locations は画面から作られた棚で、
#     鍵の決まりが移行ファイルに残っていません。ブラウザから
#     「読む・足す（loc_insert）・無効化する（is_active を直す）」が毎日 使われているので、
#     その形（読む／直す／消すは だれでもOK ＋ loc_insert）にそろえます。
#     本番の決まりがこれと違っていれば、手順4の結果も変わります。
psql -q >/dev/null 2>&1 <<'SQL'
create table if not exists public.locations (
  id bigserial primary key,
  name text not null,
  rank text,
  target integer,
  is_active boolean not null default true
);
alter table public.locations enable row level security;
drop policy if exists loc_all on public.locations;
create policy loc_all on public.locations for select to public using (true);
drop policy if exists loc_update on public.locations;
create policy loc_update on public.locations for update to public using (true) with check (true);
drop policy if exists loc_delete on public.locations;
create policy loc_delete on public.locations for delete to public using (true);
SQL
for f in daily_reports_shop_alcohol_products daily_reports_exclude_from_stats fix_expenses_total_column \
         staff_members sale_products keiri_settings_and_payments keiri_office_rent \
         advance_expenses keiri_account_mapping keiri_advance_expenses keiri_advance_expenses_receipt \
         keiri_tenants keiri_advance_expenses_tenant_id keiri_tenant_scope \
         keiri_applications keiri_applications_insert_only keiri_applications_optional_contact \
         keiri_applications_paid_pending keiri_tenant_rpc \
         locations_booth_fee location_rank_auto locations_allow_insert keiri_tenant_master; do
  psql -q -f "$ROOT/supabase/migrations/$f.sql" >/dev/null 2>&1
done
# 本番にしかない棚（移行ファイルが無い）を、最小の形で用意する
psql -q >/dev/null 2>&1 <<'SQL'
-- 出店場所は上で用意ずみ（この行は何もしない）
create table if not exists public.locations (id bigserial primary key, name text);
-- 手羽屋の選択肢を、印が空の行として置く（本番はぜんぶ印が空＝2026-10-28 A 実測）
insert into public.locations (name, rank, target) values
  ('ながやま三股','B',50000), ('PASIO高城','C',40000);
insert into public.staff_members (name, daily_wage) values ('イデ', 10000), ('じゅん', 10000);
-- 本番にある「日報の古い控え」（2026-09-02・13行）を、同じ形で1つ作る。
-- ⑦が鍵をかける相手。鍵の決まりは**付けない**状態から始める（本番と同じ）
create table if not exists public.daily_reports_backup_20260902
  (id bigserial primary key, date date, sales_amount integer, expenses jsonb);
insert into public.daily_reports_backup_20260902 (date, sales_amount)
  values ('2026-09-01', 12345), ('2026-09-02', 23456);
-- 2026-10-14：⑦を「写しぜんぶ」に広げたので、下見でも相手を増やす。
--   ・receipt_migration_backup … 日報の控えとは別の名前の写し（これも閉まるはず）
--   ・pkmn_entries_backup_20260823 … **別のアプリ**の写し（名前は当てはまるが触らないはず）
--   ・bakery_sales … 名前に bak が入っているだけの、いま使っている棚（触らないはず）
create table if not exists public.receipt_migration_backup
  (id bigserial primary key, note text);
insert into public.receipt_migration_backup (note) values ('ひとつ');
create table if not exists public.pkmn_entries_backup_20260823
  (id bigserial primary key, note text);
create table if not exists public.bakery_sales (id bigserial primary key, note text);
create table if not exists public.shifts (id bigserial primary key, date date, staff_name text, location text);
insert into public.shifts (date, staff_name, location) values ('2026-08-01','テスト','テスト広場');
-- 商品と単価の棚に、本番と同じく鍵をかける（2026-10-29）。
--   本番は enable_rls_all_tables.sql で sale_products にも鍵がかかっているが、
--   その移行ファイルは下見では流していない（ほかの棚の結果まで変わるため）。
--   ここをそろえないと、⑬で足す追い禁止の決まりが**効かないのに気づけない**
--   （鍵が開いた棚では、決まりを足しても読めたままになる）。
alter table public.sale_products enable row level security;
drop policy if exists "allow all sale_products" on public.sale_products;
create policy "allow all sale_products" on public.sale_products
  for all to public using (true) with check (true);
-- 本番の立替（経営・51行）に相当する手羽屋の行。⑩のあとも読める・直せる・消せるはず
insert into public.advance_expenses (date, payer, amount, description, settled)
  values ('2026-09-03','テスト太郎',3000,'テストの立替',false),
         ('2026-09-04','テスト花子',4000,'テストの立替',false);
-- 本番と同じ鍵のかけ方にそろえる（移行ファイルには残っていないが、本番は
-- 「鍵は入っているが決まりは だれでも・条件なし 1本だけ」＝2026-10-17 A 実測）。
-- ここをそろえないと、⑩で足す追い禁止の決まりが効かず「読めてしまう」ことに気づけない。
alter table public.advance_expenses enable row level security;
drop policy if exists "allow all advance_expenses" on public.advance_expenses;
create policy "allow all advance_expenses" on public.advance_expenses
  for all to public using (true) with check (true);
insert into public.daily_reports (date, location, staff_name, shop, sales_amount, expenses) values
 ('2026-09-05','テスト広場','テスト','手羽屋', 34050,
  '[{"description":"仕入","amount":12000,"receipt_image_url":"https://example/x.jpg"},{"description":"場代","amount":3405}]'::jsonb);
SQL

# 本番の Supabase と同じく、公開の鍵（anon）に読む許可を与える。
# ⑧は「公開の鍵では よその店の行が読めない」ことを確かめるので、この許可が無いと試せない。
psql -q >/dev/null 2>&1 <<'SQL'
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
-- いまある番号立て（sequence）にも、本番の Supabase と同じく公開の鍵で触れるようにする。
--   2026-10-28：これが欠けていたため、出店場所を入れる試しが
--   「番号立ての権限がない」で落ちました（下見だけの事情で、本番の話ではありません）。
grant usage, select on all sequences in schema public to anon, authenticated;
-- ★ここから先に**貼り紙が作る棚**（①②）も、本番と同じく公開の鍵で使えるようにする。
--   Supabase は「これから作られる棚にも、同じ許可を自動で渡す」設定が入っているので、
--   下見でもそれにそろえる。これが無いと、①②だけ本番より厳しくなり、
--   「手羽屋の画面が止まった」と読み違える（2026-10-18 に実際に出た）。
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public grant usage on sequences to anon, authenticated;
SQL

NG=0
# ★「OK」を出したときに 0 で返すこと（1 で返すと、呼び出し側の || が
#   そのまま「NG」も出してしまう。2026-10-13 に実際にやった）
say() {
  printf "%-46s %s\n" "$1" "$2"
  case "$2" in NG*) NG=1 ;; esac
  return 0
}
want() { # 期待する値と実際の値を比べる： want 名前 期待 実際
  if [ "$2" = "$3" ]; then say "$1" "OK"; else say "$1" "NG（$3 ／ほしい値 $2）"; fi
  return 0
}

BEFORE_REPORTS="$(q "select count(*)||'/'||count(tenant_id) from public.daily_reports")"
BEFORE_TEBAYA="$(q "select count(*) from public.daily_reports where tenant_id is null")"
BEFORE_BACKUP="$(q "select count(*) from public.daily_reports_backup_20260902")"
# 2026-10-17：⑩は立替（経営）に読む決まりを1本 足すだけ（1本→2本になるはず）
BEFORE_ADV_POLICIES="$(q "select count(*) from pg_policies where tablename='advance_expenses'")"
# 2026-10-18：⑪は払った記録に読む決まりを1本 足す（流す前の本数と比べる）
BEFORE_PAY_POLICIES_ALL="$(q "select count(*) from pg_policies where tablename='keiri_payments'")"
PAY_TEBAYA_BEFORE="$(q "select count(*) from public.keiri_payments where tenant_id is null")"

# --- 貼り紙を3回 流す ---------------------------------------------------------
for i in 1 2 3; do
  psql -v ON_ERROR_STOP=1 -f "$SHEET" >"$WORK/run$i.log" 2>&1
  rc=$?
  want "$i 回目が最後まで通る" "0" "$rc"
  if [ "$i" = "1" ]; then
    grep -q "⑧ よその店の日報を、公開の鍵では読めないようにしました" "$WORK/run$i.log" \
      && say "⑧ 読む決まりを足した" "OK" || say "⑧ 読む決まりを足した" "NG"
    grep -q "⑥ テストの店の初回設定：ok" "$WORK/run$i.log" \
      && say "⑥ テストのお店ができた" "OK" || say "⑥ テストのお店ができた" "NG"
    grep -q "⑦ 手羽屋のデータの写しに鍵をかけました" "$WORK/run$i.log" \
      && say "⑦ 写しに鍵をかけた" "OK" || say "⑦ 写しに鍵をかけた" "NG"
    grep -q "⑩ よその店の立替を、公開の鍵では読めないようにしました" "$WORK/run$i.log" \
      && say "⑩ 立替（経営）の読む決まりを足した" "OK" || say "⑩ 立替（経営）の読む決まりを足した" "NG"
    grep -q "⑪ よその店の払った記録を、公開の鍵では読めないようにしました" "$WORK/run$i.log" \
      && say "⑪ 払った記録の読む決まりを足した" "OK" || say "⑪ 払った記録の読む決まりを足した" "NG"
    want "⑫ のこりの4棚の読む決まりを足した" "4" \
      "$(grep -c "⑫ よその店の.*を、公開の鍵では読めないようにしました" "$WORK/run$i.log")"
  else
    grep -q "⑧ 読む決まりは、もうありました" "$WORK/run$i.log" \
      && say "⑧ $i 回目は何もしない" "OK" || say "⑧ $i 回目は何もしない" "NG"
    grep -q "⑥ テストの店は、もうありました" "$WORK/run$i.log" \
      && say "$i 回目は増やさない" "OK" || say "$i 回目は増やさない" "NG"
    grep -q "⑦ 鍵をかける写しはありませんでした" "$WORK/run$i.log" \
      && say "⑦ $i 回目は何もしない" "OK" || say "⑦ $i 回目は何もしない" "NG"
    grep -q "⑩ 立替（経営）の読む決まりは、もうありました" "$WORK/run$i.log" \
      && say "⑩ $i 回目は何もしない" "OK" || say "⑩ $i 回目は何もしない" "NG"
    grep -q "⑪ 払った記録の読む決まりは、もうありました" "$WORK/run$i.log" \
      && say "⑪ $i 回目は何もしない" "OK" || say "⑪ $i 回目は何もしない" "NG"
    want "⑫ $i 回目は4棚とも何もしない" "4" \
      "$(grep -c "⑫ .*の読む決まりは、もうありました" "$WORK/run$i.log")"
  fi
done

# --- 流れたあとの形を確かめる -------------------------------------------------
want "① 金庫の記録の棚ができた" "1" "$(q "select count(*) from information_schema.tables where table_name='keiri_cash_events'")"
want "② 数えない印の棚ができた" "1" "$(q "select count(*) from information_schema.tables where table_name='keiri_expense_ignores'")"
want "①② の鍵の決まりは4本（だれでもOK＋⑫の読む決まり）" "4" "$(q "select count(*) from pg_policies where tablename in ('keiri_cash_events','keiri_expense_ignores')")"
want "③ 写真の印が付いた" "1" "$(q "select receipt_count from public.keiri_reports limit 1")"
want "③ 写真の住所は今までどおり抜けている" "0" "$(q "select count(*) from public.keiri_reports r, jsonb_array_elements(r.expenses) x where x ? 'receipt_image_url'")"
want "④ 立替の古い棚に印の欄" "1" "$(q "select count(*) from information_schema.columns where table_name='advance_expenses' and column_name='tenant_id'")"
want "⑤ シフトの棚に印の欄" "1" "$(q "select count(*) from information_schema.columns where table_name='shifts' and column_name='tenant_id'")"
want "⑥ テストのお店が1軒だけ・active" "1/active" "$(q "select count(*)||'/'||max(status) from public.keiri_tenants where external_session_id='test-b2-kensa-1006'")"
want "⑥ そのお店ぶんの設定が1行" "1" "$(q "select count(*) from public.keiri_settings where business_type_code like 't\_%'")"
# 2026-10-17：⑥が手順5の日報1枚（印はテストの店）も入れるようになった。
#   いちばん大事なのは **手羽屋の行（印が空）が1行も変わらないこと**。
want "手羽屋の行（印が空）は1行も変わらない" "$BEFORE_TEBAYA" "$(q "select count(*) from public.daily_reports where tenant_id is null")"
want "⑥ 手順5の日報が1枚 入った" "1" "$(q "select count(*) from public.daily_reports where tenant_id is not null")"
want "⑥ その日報は3回 流しても1枚のまま" "1" "$(q "select count(*) from public.daily_reports r join public.keiri_tenants t on t.id=r.tenant_id where t.external_session_id='test-b2-kensa-1006'")"
want "⑥ その日報の中身は固定値（売上／日当）" "30000/10000" "$(q "select sales_amount||'/'||labor from public.daily_reports where tenant_id is not null limit 1")"
want "シフトの印も空のまま" "0" "$(q "select count(tenant_id) from public.shifts")"
# 2026-10-17：⑨＝払った記録の棚に印の欄を足すだけ（決まりも読む所も変えない）
want "⑨ 払った記録の棚に印の欄" "1" "$(q "select count(*) from information_schema.columns where table_name='keiri_payments' and column_name='tenant_id'")"
want "⑨ 払った記録の印も空のまま" "0" "$(q "select count(tenant_id) from public.keiri_payments")"
want "⑨ いまある「だれでもOK」は消していない" "1" "$(q "select count(*) from pg_policies where tablename='keiri_payments' and policyname='allow all keiri_payments'")"
want "⑦ 日報の古い控えに鍵がかかった" "t" "$(q "select relrowsecurity from pg_class where relname='daily_reports_backup_20260902'")"
want "⑦ その控えの決まりは0本（サーバー側の鍵だけ）" "0" "$(q "select count(*) from pg_policies where tablename='daily_reports_backup_20260902'")"
want "⑦ 控えの中身は1行も減らない" "$BEFORE_BACKUP" "$(q "select count(*) from public.daily_reports_backup_20260902")"
# 2026-10-14：⑦を「写しぜんぶ」に広げた分の確かめ。
#   いちばん大事なのは **いま使っている棚と別のアプリの棚に届かないこと**。
want "⑦ もう1つの写しにも鍵がかかった" "t" "$(q "select relrowsecurity from pg_class where relname='receipt_migration_backup'")"
want "⑦ 別のアプリの写しは触らない" "f" "$(q "select relrowsecurity from pg_class where relname='pkmn_entries_backup_20260823'")"
want "⑦ 名前が似ているだけの棚は触らない" "f" "$(q "select relrowsecurity from pg_class where relname='bakery_sales'")"
# ⑦では日報そのものの決まりを1本も減らさない。
# 2026-10-15：⑧が「印が空の行だけ 読んでよい」を**足す**ので、本数は 1 → 2 になる
# （「だれでもOK」は消していないことを、⑧の所でも名指しで確かめている）。
want "⑦⑧ 日報の決まりは減らず2本（だれでもOK＋⑧）" "2" "$(q "select count(*) from pg_policies where tablename='daily_reports'")"

# --- ⑧ よその店の日報が、公開の鍵で読めないか（2026-10-15 追記・f3-4） --------
#   ★いちばん大事なのは **手羽屋の行が今までどおり読めること**。
#     ここが崩れたら、日報の入力そのものが止まる。
want "⑧ 読む決まりが1本 付いた" "1" "$(q "select count(*) from pg_policies where tablename='daily_reports' and policyname='keiri_only_tebaya_rows_readable'")"
want "⑧ いまある「だれでもOK」は消していない" "1" "$(q "select count(*) from pg_policies where tablename='daily_reports' and policyname='allow all daily_reports'")"
# よその店の行（印つき）を1行 入れて、公開の鍵で見えるかを試す
TEST_TENANT="$(q "select id from public.keiri_tenants where external_session_id='test-b2-kensa-1006' limit 1")"
psql -q -c "insert into public.daily_reports (date, location, staff_name, shop, sales_amount, tenant_id) values ('2026-09-07','【テスト】テスト広場','【テスト】テスト太郎','手羽屋',1000,'$TEST_TENANT')" >/dev/null 2>&1
want "⑧ 手羽屋の行は、公開の鍵で今までどおり読める" "1" "$(q "set role anon; select count(*) from public.daily_reports where tenant_id is null")"
want "⑧ よその店の行は、公開の鍵では読めない" "0" "$(q "set role anon; select count(*) from public.daily_reports where tenant_id is not null")"
want "⑧ 軽い日報（経理の見え方）も、よその店は読めない" "0" "$(q "set role anon; select count(*) from public.keiri_reports where tenant_id is not null")"
want "⑧ 書き換えて取り出す道でも読めない" "0" "$(q "set role anon; with u as (update public.daily_reports set handover=handover where tenant_id is not null returning 1) select count(*) from u")"
want "⑧ 窓口は、その店の日報を返す" "1" "$(q "set role anon; select count(*) from public.keiri_tenant_reports(null,'2026-09-07','2026-09-07','test-b2-kensa-1006')")"
want "⑧ 窓口は、⑥で入れた手順5の日報も返す" "1" "$(q "set role anon; select count(*) from public.keiri_tenant_reports(null,'2026-10-06','2026-10-06','test-b2-kensa-1006')")"
want "⑧ 窓口は、知らない印には何も返さない" "0" "$(q "set role anon; select count(*) from public.keiri_tenant_reports(null,null,null,'test-knowhere')")"
want "⑧ 窓口は、合言葉のかたちでなければ何も返さない" "0" "$(q "set role anon; select count(*) from public.keiri_tenant_reports('ちがう合言葉',null,null,null)")"
want "⑧ 窓口はレシート写真の住所を返さない" "0" "$(q "set role anon; select count(*) from public.keiri_tenant_reports(null,null,null,'test-b2-kensa-1006') w, jsonb_array_elements(w -> 'expenses') x where x ? 'receipt_image_url'")"
# --- ⑧のあと、アプリ側（公開の鍵）で何ができないか（2026-10-17 追記・f5-4） --------
#   ここが「手順5を貼り紙⑥の中で入れる」理由そのものです。
#   どちらかが OK に変わったら、⑥から日報を外してアプリ側に戻してよいという意味になります。
psql -tA -c "set role anon; insert into public.daily_reports (date, location, staff_name, shop, sales_amount, tenant_id) values ('2026-09-08','【テスト】テスト広場','【テスト】テスト太郎','手羽屋',1000,'$TEST_TENANT') returning id" >/dev/null 2>&1 \
  && say "⑧ 公開の鍵では、印つきの日報を入れて番号を受け取れない" "NG（入れられてしまいました）" \
  || say "⑧ 公開の鍵では、印つきの日報を入れて番号を受け取れない" "OK"
FOREIGN_BEFORE="$(q "select count(*) from public.daily_reports where tenant_id is not null")"
psql -q -c "set role anon; delete from public.daily_reports where tenant_id is not null" >/dev/null 2>&1
want "⑧ 公開の鍵では、印つきの日報を消せない（1行も減らない）" "$FOREIGN_BEFORE" "$(q "select count(*) from public.daily_reports where tenant_id is not null")"

# --- ⑧のあと、手羽屋が毎日やることが1つも止まらないか（2026-10-19 追記・f3-3・f3-4） --
#   ここが本当の肝です。⑧が足す決まりは「読むときだけ」に効くはずですが、
#   **日報の保存は入れたあとに番号を読み返す形**（insert → select("id")）なので、
#   読む決まりが書き込みの道にも効くなら、**手羽屋の日報の入力が止まります**。
#   いままで試していなかったので、ここで固定します（1つでも NG なら貼ってはいけません）。
psql -tA -c "set role anon; insert into public.daily_reports (date, location, staff_name, shop, sales_amount) values ('2026-09-21','テスト広場','テスト','手羽屋',5000) returning id" >/dev/null 2>&1 \
  && say "⑧ 手羽屋の日報は、公開の鍵で入れて番号を読み返せる（毎日の保存）" "OK" \
  || say "⑧ 手羽屋の日報は、公開の鍵で入れて番号を読み返せる（毎日の保存）" "NG（日報の入力が止まります）"
want "⑧ 手羽屋の日報は、公開の鍵で直せる（日報の編集）" "1" "$(q "set role anon; with u as (update public.daily_reports set handover='なおした' where date='2026-09-21' and tenant_id is null returning 1) select count(*) from u")"
psql -q -c "set role anon; delete from public.daily_reports where date='2026-09-21' and tenant_id is null" >/dev/null 2>&1
want "⑧ 手羽屋の日報は、公開の鍵で消せる（管理の取り消し）" "0" "$(q "select count(*) from public.daily_reports where date='2026-09-21'")"
want "⑧ 手羽屋の行の数は、はじめと同じ" "$BEFORE_TEBAYA" "$(q "select count(*) from public.daily_reports where tenant_id is null")"
#   申し込んだお店は「番号を読み返さなければ入れられる」——アプリ側の直し
#   （lib/keiri/tenantReportWrite.ts）が、この1点に乗っています。
#   ★ここが NG に変わったら、申し込んだお店は画面から日報を出せません。
psql -q -c "set role anon; insert into public.daily_reports (date, location, staff_name, shop, sales_amount, tenant_id) values ('2026-09-22','【テスト】テスト広場','【テスト】テスト太郎','手羽屋',1000,'$TEST_TENANT')" >/dev/null 2>&1 \
  && say "⑧ 申し込んだお店の日報は、番号を読み返さなければ入れられる" "OK" \
  || say "⑧ 申し込んだお店の日報は、番号を読み返さなければ入れられる" "NG（画面から日報を出せません）"
want "⑧ その行は、ちゃんと棚に入っている（倉庫の側から数える）" "1" "$(q "select count(*) from public.daily_reports where date='2026-09-22'")"
psql -q -c "delete from public.daily_reports where date='2026-09-22'" >/dev/null 2>&1

# --- 手順４ そのお店の出店場所が1件 入るか（2026-10-28 追記・2026-10-29 書き直し・f5-4） ---
#   2軒目を入れる手順は6手あり、そのうち **手順４（そのお店の出店場所を入れる）**だけが
#   2026-10-28 まで **下見に一度もかかっていませんでした**（下見の出店場所は「番号と名前」だけの
#   最小の形で、印も鍵も無かったため）。
#
#   ★2026-10-29・kp266：⑬で この棚にも⑧と同じ決まり（印が空の行だけ 読んでよい）を
#     足したので、**公開の鍵では 印つきの出店場所を入れて番号を読み返すことも、
#     消すこともできません**（日報でまったく同じことが起きたのが 2026-10-17）。
#     そのため手順４の行は、⑥がこの1枚の中で入れます。ここで見るのは
#       ・⑥が1件 入れたか（何度 流しても増えないか）
#       ・そのお店の出店場所が、**倉庫の窓口ごしに**読めるか
#       ・公開の鍵からは隠れているか
#       ・**手羽屋の出店場所は今までどおり読める・入れられる・消せるか**（ここが要）
LOC_TEBAYA="$(q "select count(*) from public.locations where tenant_id is null")"
want "手順４ ⑥が、そのお店の出店場所を1件 入れた" "1" "$(q "select count(*) from public.locations where tenant_id is not null")"
want "手順４ 何度 流しても増えない（印つきは1件のまま）" "1" "$(q "select count(*) from public.locations where tenant_id='$TEST_TENANT' and name='【テスト】テスト広場'")"
want "手順４ そのお店の出店場所は、窓口ごしに読める" "1" "$(q "set role anon; select count(*) from public.keiri_tenant_locations(null, null, null, 'test-b2-kensa-1006')")"
want "手順４ 窓口の答えに、手羽屋の場所は混じらない" "0" "$(q "set role anon; select count(*) from (select (x->>'name') as n from public.keiri_tenant_locations(null,null,null,'test-b2-kensa-1006') x) y where n not like '【テスト】%'")"
want "手順４ そのお店の出店場所は、公開の鍵では読めない" "0" "$(q "set role anon; select count(*) from public.locations where tenant_id='$TEST_TENANT'")"
want "手順４ 手羽屋の出店場所の件数は、はじめと同じ" "$LOC_TEBAYA" "$(q "set role anon; select count(*) from public.locations where tenant_id is null")"
# ★ここが要です：手羽屋の毎日の画面（日報の選択肢・シフト・管理のマスタ）が
#   今までどおり動くこと。読めるだけでなく、入れる・直す・消すまで見ます。
psql -tA -c "set role anon; insert into public.locations (name, rank, target, is_active) values ('【下見】手羽屋の新しい場所','C',40000,true) returning id" >/dev/null 2>&1 \
  && say "手順４ 手羽屋の出店場所は、公開の鍵で入れて番号も読み返せる" "OK" \
  || say "手順４ 手羽屋の出店場所は、公開の鍵で入れて番号も読み返せる" "NG（管理のマスタ画面が止まります）"
want "手順４ 手羽屋の出店場所は、公開の鍵で直せる" "1" "$(q "set role anon; with u as (update public.locations set target=45000 where name='【下見】手羽屋の新しい場所' returning 1) select count(*) from u")"
want "手順４ 手羽屋の出店場所は、公開の鍵で消せる" "1" "$(q "set role anon; with d as (delete from public.locations where name='【下見】手羽屋の新しい場所' returning 1) select count(*) from d")"
want "手順４ 出し入れのあと、手羽屋の件数は はじめと同じ" "$LOC_TEBAYA" "$(q "select count(*) from public.locations where tenant_id is null")"
# --- 手順４（もう半分） そのお店の商品（名前と単価）が1件 入るか（2026-10-30 追記・f5-4） ---
#   日報の STEP4 は「単価 × 本数」とレジの売上を突き合わせる所で、ここがこのアプリの検算の芯。
#   申し込んだお店は商品の一覧を直す画面に入れないので、⑥がそのお店ぶんを1件 入れる。
#   見るのは4つ：⑥が1件 入れたか／何度 流しても増えないか／窓口ごしに読めるか／
#   公開の鍵からは隠れているか。**手羽屋の商品7件には1行も触らないこと**もここで見る。
PROD_TEBAYA_0="$(q "select count(*) from public.sale_products where tenant_id is null")"
want "手順４ ⑥が、そのお店の商品を1件 入れた" "1" "$(q "select count(*) from public.sale_products where tenant_id is not null")"
want "手順４ 何度 流しても増えない（印つきは1件のまま）" "1" "$(q "select count(*) from public.sale_products where tenant_id='$TEST_TENANT' and name='【テスト】テスト商品'")"
want "手順４ その商品の中身は固定値（単価／種別／お店）" "500/primary/手羽屋" "$(q "select price||'/'||kind||'/'||shop from public.sale_products where tenant_id='$TEST_TENANT' and name='【テスト】テスト商品'")"
want "手順４ 単価×本数が売上とぴったり合う（30000÷500＝60本）" "60/true" "$(q "select (30000/price)||'/'||((30000 % price)=0) from public.sale_products where tenant_id='$TEST_TENANT' and name='【テスト】テスト商品'")"
want "手順４ その商品は、窓口ごしに読める" "1" "$(q "set role anon; select count(*) from public.keiri_tenant_products(null, null, null, 'test-b2-kensa-1006')")"
want "手順４ 窓口の答えに、手羽屋の商品は混じらない" "0" "$(q "set role anon; select count(*) from (select (x->>'name') as n from public.keiri_tenant_products(null,null,null,'test-b2-kensa-1006') x) y where n not like '【テスト】%'")"
want "手順４ その商品は、公開の鍵では読めない" "0" "$(q "set role anon; select count(*) from public.sale_products where tenant_id='$TEST_TENANT'")"
want "手順４ 手羽屋の商品の件数は、はじめと同じ" "$PROD_TEBAYA_0" "$(q "set role anon; select count(*) from public.sale_products where tenant_id is null")"

# 担当者・商品の棚も、印が空のままで手羽屋が読めること（日報の選択肢）
want "手順４ 手羽屋の担当者は、公開の鍵で今までどおり読める" "2" "$(q "set role anon; select count(*) from public.staff_members where tenant_id is null")"

# --- ⑬ 選択肢の棚3つが締まったか（2026-10-29 追記・f3-4・kp266） ---------------
#   ★2026-10-28 まで、ここは「**未完：まだ公開の鍵で読める**」という事実を
#     そのまま固める課題でした（貼り紙が1行も足していなかったため）。
#   ⑬で、出店場所・担当者・商品にも ⑧と同じ決まり（印が空の行だけ 読んでよい）と
#   倉庫の窓口を対で足したので、ここを**閉まっている側**に書き換えます。
#   見るのは4つ：よその店の行が隠れたか／窓口ごしには読めるか／
#   窓口が知らない印に答えないか／**手羽屋の行は今までどおり読めるか**。
STAFF_TEBAYA="$(q "select count(*) from public.staff_members where tenant_id is null")"
PROD_TEBAYA="$(q "select count(*) from public.sale_products where tenant_id is null")"
psql -q -c "insert into public.staff_members (tenant_id, name, daily_wage) values ('$TEST_TENANT','【テスト】よその人',9000)" >/dev/null 2>&1
psql -q -c "insert into public.sale_products (tenant_id, name, price) values ('$TEST_TENANT','【テスト】よその商品',300)" >/dev/null 2>&1
want "⑬ locations に読む決まりが1本 付いた" "1" "$(q "select count(*) from pg_policies where tablename='locations' and policyname='keiri_only_tebaya_locations_readable'")"
want "⑬ staff_members に読む決まりが1本 付いた" "1" "$(q "select count(*) from pg_policies where tablename='staff_members' and policyname='keiri_only_tebaya_staff_readable'")"
want "⑬ sale_products に読む決まりが1本 付いた" "1" "$(q "select count(*) from pg_policies where tablename='sale_products' and policyname='keiri_only_tebaya_products_readable'")"
want "⑬ 窓口が3つ できた" "3" "$(q "select count(*) from pg_proc where proname in ('keiri_tenant_locations','keiri_tenant_staff','keiri_tenant_products')")"
want "⑬ よその店の担当者は、公開の鍵では読めない" "0" "$(q "set role anon; select count(*) from public.staff_members where tenant_id is not null")"
want "⑬ よその店の商品は、公開の鍵では読めない" "0" "$(q "set role anon; select count(*) from public.sale_products where tenant_id is not null")"
want "⑬ 書き換えて取り出す道でも読めない" "0" "$(q "set role anon; select count(*) from public.staff_members where tenant_id::text like '%'")"
want "⑬ 窓口は、その店の担当者を返す" "1" "$(q "set role anon; select count(*) from public.keiri_tenant_staff(null,null,null,'test-b2-kensa-1006')")"
# ★2026-10-30：⑥がそのお店ぶんの商品を1件 入れるようになったので、
#   ここでは「⑥の1件＋この試しの1件」＝2件 返るのが正しい。
want "⑬ 窓口は、その店の商品を返す" "2" "$(q "set role anon; select count(*) from public.keiri_tenant_products(null,null,null,'test-b2-kensa-1006')")"
want "⑬ 窓口は、知らない印には何も返さない" "0" "$(q "set role anon; select count(*) from public.keiri_tenant_staff(null,null,null,'test-shiranai')")"
want "⑬ 窓口は、合言葉のかたちでなければ何も返さない" "0" "$(q "set role anon; select count(*) from public.keiri_tenant_products('あいことば',null,null,null)")"
want "⑬ 手羽屋の担当者は、公開の鍵で今までどおり読める" "$STAFF_TEBAYA" "$(q "set role anon; select count(*) from public.staff_members where tenant_id is null")"
want "⑬ 手羽屋の商品は、公開の鍵で今までどおり読める" "$PROD_TEBAYA" "$(q "set role anon; select count(*) from public.sale_products where tenant_id is null")"
psql -tA -c "set role anon; insert into public.staff_members (name, daily_wage) values ('【下見】新しい人',9500) returning id" >/dev/null 2>&1 \
  && say "⑬ 手羽屋の担当者は、公開の鍵で入れて番号も読み返せる" "OK" \
  || say "⑬ 手羽屋の担当者は、公開の鍵で入れて番号も読み返せる" "NG（管理のマスタ画面が止まります）"
want "⑬ 手羽屋の担当者は、公開の鍵で消せる" "1" "$(q "set role anon; with d as (delete from public.staff_members where name='【下見】新しい人' returning 1) select count(*) from d")"
want "⑬ 手羽屋の担当者の件数は、はじめと同じ" "$STAFF_TEBAYA" "$(q "select count(*) from public.staff_members where tenant_id is null")"
# ★商品も同じことを見る（2026-10-30）。手羽屋の商品マスタの画面（/settings）は
#   公開の鍵で入れて番号を読み返す作りなので、ここが止まると毎日の画面が止まる。
psql -tA -c "set role anon; insert into public.sale_products (name, price, kind) values ('【下見】新しい商品',250,'normal') returning id" >/dev/null 2>&1 \
  && say "⑬ 手羽屋の商品は、公開の鍵で入れて番号も読み返せる" "OK" \
  || say "⑬ 手羽屋の商品は、公開の鍵で入れて番号も読み返せる" "NG（商品マスタの画面が止まります）"
want "⑬ 手羽屋の商品は、公開の鍵で消せる" "1" "$(q "set role anon; with d as (delete from public.sale_products where name='【下見】新しい商品' returning 1) select count(*) from d")"
want "⑬ 手羽屋の商品の件数は、はじめと同じ" "$PROD_TEBAYA" "$(q "select count(*) from public.sale_products where tenant_id is null")"
psql -q -c "delete from public.staff_members where tenant_id is not null" >/dev/null 2>&1
# ★⑥が入れた商品（【テスト】テスト商品）は消さない。この節で入れた試しの行だけを消す
psql -q -c "delete from public.sale_products where name='【テスト】よその商品'" >/dev/null 2>&1

# --- ⑩ よその店の立替（経営）が、公開の鍵で読めないか（2026-10-17 追記・f3-4） ------
#   ★いちばん大事なのは **手羽屋の立替が今までどおり読める・直せる・消せること**。
#     ここが崩れたら、じゅんの /cash/advances（立替の画面）が止まる。
want "⑩ 読む決まりが1本 付いた" "1" "$(q "select count(*) from pg_policies where tablename='advance_expenses' and policyname='keiri_only_tebaya_advances_readable'")"
want "⑩ 立替（経営）の決まりは減らず2本" "$((BEFORE_ADV_POLICIES + 1))" "$(q "select count(*) from pg_policies where tablename='advance_expenses'")"
want "⑩ いまある「だれでもOK」は消していない" "1" "$(q "select count(*) from pg_policies where tablename='advance_expenses' and policyname='allow all advance_expenses'")"
want "⑩ 立替の印は空のまま" "0" "$(q "select count(tenant_id) from public.advance_expenses")"
ADV_TEBAYA="$(q "select count(*) from public.advance_expenses where tenant_id is null")"
want "⑩ 手羽屋の立替は、公開の鍵で今までどおり読める" "$ADV_TEBAYA" "$(q "set role anon; select count(*) from public.advance_expenses where tenant_id is null")"
# よその店の立替を1行 入れて、公開の鍵で見えるかを試す（サーバー側の権限で入れる＝本番でお店が入る形）
psql -q -c "insert into public.advance_expenses (date, payer, amount, description, settled, tenant_id) values ('2026-09-09','【テスト】立替',5000,'よその店の立替',false,'$TEST_TENANT')" >/dev/null 2>&1
want "⑩ よその店の立替は、公開の鍵では読めない" "0" "$(q "set role anon; select count(*) from public.advance_expenses where tenant_id is not null")"
want "⑩ 書き換えて取り出す道でも読めない" "0" "$(q "set role anon; with u as (update public.advance_expenses set memo=memo where tenant_id is not null returning 1) select count(*) from u")"
want "⑩ 窓口は、その店の立替を返す" "1" "$(q "set role anon; select count(*) from public.keiri_tenant_advances_old(null,null,null,'test-b2-kensa-1006')")"
want "⑩ 窓口は、知らない印には何も返さない" "0" "$(q "set role anon; select count(*) from public.keiri_tenant_advances_old(null,null,null,'test-knowhere')")"
want "⑩ 窓口は、合言葉のかたちでなければ何も返さない" "0" "$(q "set role anon; select count(*) from public.keiri_tenant_advances_old('ちがう合言葉',null,null,null)")"
want "⑩ 窓口はレシート写真の住所を返さない" "0" "$(q "set role anon; select count(*) from public.keiri_tenant_advances_old(null,null,null,'test-b2-kensa-1006') w where w ? 'receipt_image_url'")"
# じゅんの立替の画面（/cash/advances）が今までどおり動くか＝入れる・直す・消すを公開の鍵で試す
psql -tA -c "set role anon; insert into public.advance_expenses (date, payer, amount, description, settled, created_by) values ('2026-09-10','テスト三郎',1200,'画面からの登録',false,'管理者')" >/dev/null 2>&1 \
  && say "⑩ 手羽屋の立替は、公開の鍵で今までどおり入れられる" "OK" \
  || say "⑩ 手羽屋の立替は、公開の鍵で今までどおり入れられる" "NG（入れられなくなりました）"
psql -q -c "set role anon; update public.advance_expenses set settled=true, settled_date='2026-09-20' where payer='テスト三郎'" >/dev/null 2>&1
want "⑩ 手羽屋の立替は、公開の鍵で精算に直せる" "1" "$(q "select count(*) from public.advance_expenses where payer='テスト三郎' and settled")"
psql -q -c "set role anon; delete from public.advance_expenses where payer='テスト三郎'" >/dev/null 2>&1
want "⑩ 手羽屋の立替は、公開の鍵で消せる" "0" "$(q "select count(*) from public.advance_expenses where payer='テスト三郎'")"
want "⑩ 手羽屋の立替の行数は、はじめと同じ" "$ADV_TEBAYA" "$(q "select count(*) from public.advance_expenses where tenant_id is null")"

# --- ⑪ よその店の払った記録が、公開の鍵で読めないか（2026-10-18 追記・f3-4） ------
#   ★いちばん大事なのは **手羽屋の払った記録が今までどおり読める・入れられる・消せること**。
#     ここが崩れたら、じゅんの経理画面（まだ払っていないお金・払った記録）が止まる。
want "⑪ 読む決まりが1本 付いた" "1" "$(q "select count(*) from pg_policies where tablename='keiri_payments' and policyname='keiri_only_tebaya_payments_readable'")"
want "⑪ 払った記録の決まりは減らず1本 増える" "$((BEFORE_PAY_POLICIES_ALL + 1))" "$(q "select count(*) from pg_policies where tablename='keiri_payments'")"
want "⑪ いまある「だれでもOK」は消していない" "1" "$(q "select count(*) from pg_policies where tablename='keiri_payments' and policyname='allow all keiri_payments'")"
# 手羽屋の払った記録を1行 入れてから（印は空＝今までの形）、公開の鍵で読めるかを見る
psql -q -c "insert into public.keiri_payments (business_type_code, paid_on, amount, kind, memo) values ('tebaya','2026-09-25',120000,'payroll','テストの給与')" >/dev/null 2>&1
PAY_TEBAYA="$(q "select count(*) from public.keiri_payments where tenant_id is null")"
want "⑪ 手羽屋の払った記録は、公開の鍵で今までどおり読める" "$PAY_TEBAYA" "$(q "set role anon; select count(*) from public.keiri_payments where tenant_id is null")"
# よその店の払った記録を1行 入れて、公開の鍵で見えるかを試す（本番でお店が入る形＝サーバー側の権限）
psql -q -c "insert into public.keiri_payments (business_type_code, paid_on, amount, kind, memo, tenant_id) values ('t_test','2026-09-26',98000,'payroll','よその店の給与','$TEST_TENANT')" >/dev/null 2>&1
want "⑪ よその店の払った記録は、公開の鍵では読めない" "0" "$(q "set role anon; select count(*) from public.keiri_payments where tenant_id is not null")"
want "⑪ 書き換えて取り出す道でも読めない" "0" "$(q "set role anon; with u as (update public.keiri_payments set memo=memo where tenant_id is not null returning 1) select count(*) from u")"
want "⑪ 窓口は、その店の払った記録を返す" "1" "$(q "set role anon; select count(*) from public.keiri_tenant_payments(null,null,null,'test-b2-kensa-1006')")"
want "⑪ 窓口は、知らない印には何も返さない" "0" "$(q "set role anon; select count(*) from public.keiri_tenant_payments(null,null,null,'test-knowhere')")"
want "⑪ 窓口は、合言葉のかたちでなければ何も返さない" "0" "$(q "set role anon; select count(*) from public.keiri_tenant_payments('ちがう合言葉',null,null,null)")"
want "⑪ 窓口は、期間の外は返さない" "0" "$(q "set role anon; select count(*) from public.keiri_tenant_payments(null,'2026-10-01','2026-10-31','test-b2-kensa-1006')")"
# じゅんの経理画面が今までどおり動くか＝入れる・消すを公開の鍵で試す
psql -tA -c "set role anon; insert into public.keiri_payments (business_type_code, paid_on, amount, kind, memo) values ('tebaya','2026-09-27',5000,'outsourcing','画面からの登録')" >/dev/null 2>&1 \
  && say "⑪ 手羽屋の払った記録は、公開の鍵で今までどおり入れられる" "OK" \
  || say "⑪ 手羽屋の払った記録は、公開の鍵で今までどおり入れられる" "NG（入れられなくなりました）"
psql -q -c "set role anon; delete from public.keiri_payments where memo='画面からの登録'" >/dev/null 2>&1
want "⑪ 手羽屋の払った記録は、公開の鍵で消せる" "0" "$(q "select count(*) from public.keiri_payments where memo='画面からの登録'")"
want "⑪ 手羽屋の払った記録の行数は、入れた1行ぶんだけ" "$((PAY_TEBAYA_BEFORE + 1))" "$(q "select count(*) from public.keiri_payments where tenant_id is null")"
# ★アプリ（公開の鍵）から「よその店の払った記録」を入れる道が、本当に通るか
#   （2026-10-21・f3-4）。ここを試していなかったので、画面が印を付けずに
#   入れていたことに気づけなかった：入った行は印が空＝手羽屋の行になり、
#   そのお店の窓口には1行も出ないので、「記録しました」と出たのに
#   未払いが1円も減らない（お店は何度も入れ直す）。
psql -tA -c "set role anon; insert into public.keiri_payments (business_type_code, paid_on, amount, kind, memo, tenant_id) values ('t_test','2026-09-28',77000,'payroll','お店の画面から（印つき）','$TEST_TENANT')" >/dev/null 2>&1 \
  && say "⑪ よその店は、公開の鍵で印つきの払った記録を入れられる" "OK" \
  || say "⑪ よその店は、公開の鍵で印つきの払った記録を入れられる" "NG（入れられません）"
want "⑪ 入れた印つきの1行は、その店の窓口から読める" "1" "$(q "set role anon; select count(*) from public.keiri_tenant_payments(null,null,null,'test-b2-kensa-1006') w where (w->>'memo')='お店の画面から（印つき）'")"
# 印を付けずに入れると、どのお店の帳簿にも出てこない（＝画面が印を付けなければならない理由）
psql -q -c "set role anon; insert into public.keiri_payments (business_type_code, paid_on, amount, kind, memo) values ('t_test','2026-09-29',66000,'payroll','お店の画面から（印なし）')" >/dev/null 2>&1
want "⑪ 印なしで入れた行は、その店の窓口には出てこない" "0" "$(q "set role anon; select count(*) from public.keiri_tenant_payments(null,null,null,'test-b2-kensa-1006') w where (w->>'memo')='お店の画面から（印なし）'")"
want "⑪ 印なしで入れた行は、手羽屋の帳簿に紛れ込む" "1" "$(q "set role anon; select count(*) from public.keiri_payments where tenant_id is null and memo='お店の画面から（印なし）'")"
psql -q -c "delete from public.keiri_payments where memo in ('お店の画面から（印つき）','お店の画面から（印なし）')" >/dev/null 2>&1

# --- ⑫ のこりの4つの棚が、公開の鍵から隠れたか（2026-10-18 追記・f3-4） ----------
#   ★いちばん大事なのは **手羽屋の行が今までどおり読める・入れられること**。
#     経理の設定が読めなくなると、経理画面の数え始めの日と期首残高が当てずっぽうになる。
for t in keiri_settings keiri_cash_events keiri_expense_ignores keiri_advance_expenses; do
  case "$t" in
    keiri_settings)          pol=keiri_only_tebaya_settings_readable ;;
    keiri_cash_events)       pol=keiri_only_tebaya_cash_events_readable ;;
    keiri_expense_ignores)   pol=keiri_only_tebaya_expense_ignores_readable ;;
    keiri_advance_expenses)  pol=keiri_only_tebaya_advance_expenses_readable ;;
  esac
  want "⑫ $t に読む決まりが1本 付いた" "1" "$(q "select count(*) from pg_policies where tablename='$t' and policyname='$pol'")"
done
want "⑫ 窓口が4つ できた" "4" "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('keiri_tenant_settings','keiri_tenant_cash_events','keiri_tenant_expense_ignores','keiri_tenant_advance_expenses')")"
# 手羽屋の行（印が空）を、4つの棚ぜんぶに1行ずつ入れてから、公開の鍵で読めるかを見る
psql -q -c "insert into public.keiri_cash_events (kind, happened_on, amount, actor) values ('count','2026-10-18',145000,'テスト')" >/dev/null 2>&1
psql -q -c "insert into public.keiri_expense_ignores (source, ref_id, line_index, amount, paid_on, reason) values ('report','tebaya-1',1,3000,'2026-09-05','テスト')" >/dev/null 2>&1
psql -q -c "insert into public.keiri_advance_expenses (business_type_code, expense_date, payer, amount, source_type, memo) select 'tebaya','2026-09-06','テスト太郎',2000, m.source_type,'テスト' from public.keiri_account_mapping m where m.business_type_code='tebaya' limit 1" >/dev/null 2>&1
want "⑫ 手羽屋の経理の設定は、公開の鍵で今までどおり読める" "1" "$(q "set role anon; select count(*) from public.keiri_settings where tenant_id is null and business_type_code='tebaya'")"
want "⑫ 手羽屋の金庫の記録は、公開の鍵で今までどおり読める" "1" "$(q "set role anon; select count(*) from public.keiri_cash_events where tenant_id is null")"
want "⑫ 手羽屋の数えない印は、公開の鍵で今までどおり読める" "1" "$(q "set role anon; select count(*) from public.keiri_expense_ignores where tenant_id is null")"
want "⑫ 手羽屋の立替（現場）は、公開の鍵で今までどおり読める" "1" "$(q "set role anon; select count(*) from public.keiri_advance_expenses where tenant_id is null")"
# よその店の行を4つの棚に入れて、公開の鍵で見えるかを試す（サーバー側の権限＝本番でお店が入る形）
psql -q -c "insert into public.keiri_cash_events (kind, happened_on, amount, tenant_id) values ('count','2026-10-18',70000,'$TEST_TENANT')" >/dev/null 2>&1
psql -q -c "insert into public.keiri_expense_ignores (source, ref_id, line_index, amount, paid_on, tenant_id) values ('report','yoso-1',0,1500,'2026-09-05','$TEST_TENANT')" >/dev/null 2>&1
psql -q -c "insert into public.keiri_advance_expenses (business_type_code, expense_date, payer, amount, source_type, tenant_id) select 'tebaya','2026-09-06','【テスト】よその店',9000, m.source_type,'$TEST_TENANT' from public.keiri_account_mapping m where m.business_type_code='tebaya' limit 1" >/dev/null 2>&1
want "⑫ よその店の経理の設定は、公開の鍵では読めない" "0" "$(q "set role anon; select count(*) from public.keiri_settings where tenant_id is not null")"
want "⑫ よその店の金庫の記録は、公開の鍵では読めない" "0" "$(q "set role anon; select count(*) from public.keiri_cash_events where tenant_id is not null")"
want "⑫ よその店の数えない印は、公開の鍵では読めない" "0" "$(q "set role anon; select count(*) from public.keiri_expense_ignores where tenant_id is not null")"
want "⑫ よその店の立替（現場）は、公開の鍵では読めない" "0" "$(q "set role anon; select count(*) from public.keiri_advance_expenses where tenant_id is not null")"
# 窓口は、その店のぶんだけを返す
want "⑫ 窓口は、その店の経理の設定を返す" "1" "$(q "set role anon; select count(*) from public.keiri_tenant_settings(null,null,null,'test-b2-kensa-1006')")"
want "⑫ 窓口は、その店の金庫の記録を返す" "1" "$(q "set role anon; select count(*) from public.keiri_tenant_cash_events(null,null,null,'test-b2-kensa-1006')")"
want "⑫ 窓口は、その店の数えない印を返す" "1" "$(q "set role anon; select count(*) from public.keiri_tenant_expense_ignores(null,null,null,'test-b2-kensa-1006')")"
want "⑫ 窓口は、その店の立替（現場）を返す" "1" "$(q "set role anon; select count(*) from public.keiri_tenant_advance_expenses(null,null,null,'test-b2-kensa-1006')")"
want "⑫ 窓口は、知らない印には何も返さない" "0" "$(q "set role anon; select count(*) from public.keiri_tenant_cash_events(null,null,null,'test-knowhere')")"
want "⑫ 窓口は、合言葉のかたちでなければ何も返さない" "0" "$(q "set role anon; select count(*) from public.keiri_tenant_settings('ちがう合言葉',null,null,null)")"
want "⑫ 窓口は、期間の外は返さない" "0" "$(q "set role anon; select count(*) from public.keiri_tenant_cash_events(null,'2026-11-01','2026-11-30','test-b2-kensa-1006')")"
want "⑫ 窓口はレシート写真の住所を返さない" "0" "$(q "set role anon; select count(*) from public.keiri_tenant_advance_expenses(null,null,null,'test-b2-kensa-1006') w where w ? 'receipt_image_url'")"
# 手羽屋の画面が今までどおり動くか＝入れる・直す・消すを公開の鍵で試す
psql -tA -c "set role anon; insert into public.keiri_cash_events (kind, happened_on, amount, actor) values ('count','2026-10-19',150000,'画面から') returning id" >/dev/null 2>&1 \
  && say "⑫ 手羽屋の金庫の記録は、公開の鍵で入れて番号も受け取れる" "OK" \
  || say "⑫ 手羽屋の金庫の記録は、公開の鍵で入れて番号も受け取れる" "NG（入れられなくなりました）"
psql -q -c "set role anon; update public.keiri_settings set memo=memo where tenant_id is null" >/dev/null 2>&1 \
  && say "⑫ 手羽屋の経理の設定は、公開の鍵で直せる" "OK" \
  || say "⑫ 手羽屋の経理の設定は、公開の鍵で直せる" "NG（直せなくなりました）"
psql -q -c "set role anon; delete from public.keiri_cash_events where actor='画面から'" >/dev/null 2>&1
want "⑫ 手羽屋の金庫の記録は、公開の鍵で消せる" "0" "$(q "select count(*) from public.keiri_cash_events where actor='画面から'")"
# ★よその店の行を「直す・消す」と、どうなるか（2026-10-21・f3-4）。
#   読む決まりは**どの行を直すかを選ぶところにも効く**ので、
#   エラーも出ないまま **0行** だけ直ります。
#   ＝ 画面が「できました」と出すと嘘になる（lib/keiri/expenseIgnoreWrite.ts で止めている）。
want "⑫ よその店の数えない印は、公開の鍵で直しても0行" "0" "$(q "set role anon; with u as (update public.keiri_expense_ignores set undone_at=now() where tenant_id is not null returning 1) select count(*) from u")"
want "⑫ よその店の数えない印は、公開の鍵で消しても0行" "0" "$(q "set role anon; with d as (delete from public.keiri_expense_ignores where tenant_id is not null returning 1) select count(*) from d")"
want "⑫ よその店の数えない印は、直そうとしても残っている" "1" "$(q "select count(*) from public.keiri_expense_ignores where tenant_id is not null and undone_at is null")"
want "⑫ 手羽屋の数えない印は、公開の鍵で今までどおり直せる" "1" "$(q "set role anon; with u as (update public.keiri_expense_ignores set reason=reason where tenant_id is null returning 1) select count(*) from u")"

# 入れたテストの行は、確かめが済んだら取り消す（本番ではなく、このパソコンの中の倉庫）
psql -q -c "delete from public.daily_reports where tenant_id is not null" >/dev/null 2>&1
psql -q -c "delete from public.advance_expenses where tenant_id is not null" >/dev/null 2>&1
psql -q -c "delete from public.keiri_payments where tenant_id is not null" >/dev/null 2>&1
for t in keiri_cash_events keiri_expense_ignores keiri_advance_expenses; do
  psql -q -c "delete from public.$t where tenant_id is not null" >/dev/null 2>&1
done

# --- 止め木が効くか -----------------------------------------------------------
psql -q -c "insert into public.keiri_cash_events(kind,happened_on,amount) values ('count','2026-10-13',-1)" >/dev/null 2>&1 \
  && say "① マイナスの金額を断る" "NG" || say "① マイナスの金額を断る" "OK"
psql -q -c "insert into public.keiri_cash_events(kind,happened_on,amount) values ('bank','2026-10-13',1)" >/dev/null 2>&1 \
  && say "① 知らない種類を断る" "NG" || say "① 知らない種類を断る" "OK"
psql -q -c "insert into public.keiri_expense_ignores(source,ref_id,line_index) values ('report','x',0)" >/dev/null 2>&1
psql -q -c "insert into public.keiri_expense_ignores(source,ref_id,line_index) values ('report','x',0)" >/dev/null 2>&1 \
  && say "② 同じ行に効いている印は1つだけ" "NG" || say "② 同じ行に効いている印は1つだけ" "OK"

echo "----------------------------------------------"
if [ "$NG" = "0" ]; then
  echo "OK：貼り紙は13 ぜんぶ通り、何度 流しても増えません（本番ではなく、同じ形の空の倉庫での結果です）"
  exit 0
fi
echo "NG：直してから、じゅんに渡す1枚を更新してください"
exit 1
