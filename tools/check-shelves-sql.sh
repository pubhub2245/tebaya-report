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
for f in daily_reports_shop_alcohol_products daily_reports_exclude_from_stats fix_expenses_total_column \
         staff_members sale_products keiri_settings_and_payments keiri_office_rent \
         advance_expenses keiri_account_mapping keiri_advance_expenses keiri_advance_expenses_receipt \
         keiri_tenants keiri_advance_expenses_tenant_id keiri_tenant_scope \
         keiri_applications keiri_applications_insert_only keiri_applications_optional_contact \
         keiri_applications_paid_pending keiri_tenant_rpc; do
  psql -q -f "$ROOT/supabase/migrations/$f.sql" >/dev/null 2>&1
done
# 本番にしかない棚（移行ファイルが無い）を、最小の形で用意する
psql -q >/dev/null 2>&1 <<'SQL'
create table if not exists public.locations (id bigserial primary key, name text);
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
insert into public.daily_reports (date, location, staff_name, shop, sales_amount, expenses) values
 ('2026-09-05','テスト広場','テスト','手羽屋', 34050,
  '[{"description":"仕入","amount":12000,"receipt_image_url":"https://example/x.jpg"},{"description":"場代","amount":3405}]'::jsonb);
SQL

# 本番の Supabase と同じく、公開の鍵（anon）に読む許可を与える。
# ⑧は「公開の鍵では よその店の行が読めない」ことを確かめるので、この許可が無いと試せない。
psql -q >/dev/null 2>&1 <<'SQL'
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
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
# 2026-10-17：⑨は欄を足すだけ。鍵の決まりが増えていないことを、流す前の本数と比べる
BEFORE_PAYMENT_POLICIES="$(q "select count(*) from pg_policies where tablename='keiri_payments'")"

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
  else
    grep -q "⑧ 読む決まりは、もうありました" "$WORK/run$i.log" \
      && say "⑧ $i 回目は何もしない" "OK" || say "⑧ $i 回目は何もしない" "NG"
    grep -q "⑥ テストの店は、もうありました" "$WORK/run$i.log" \
      && say "$i 回目は増やさない" "OK" || say "$i 回目は増やさない" "NG"
    grep -q "⑦ 鍵をかける写しはありませんでした" "$WORK/run$i.log" \
      && say "⑦ $i 回目は何もしない" "OK" || say "⑦ $i 回目は何もしない" "NG"
  fi
done

# --- 流れたあとの形を確かめる -------------------------------------------------
want "① 金庫の記録の棚ができた" "1" "$(q "select count(*) from information_schema.tables where table_name='keiri_cash_events'")"
want "② 数えない印の棚ができた" "1" "$(q "select count(*) from information_schema.tables where table_name='keiri_expense_ignores'")"
want "①② の鍵の決まりが2本だけ" "2" "$(q "select count(*) from pg_policies where tablename in ('keiri_cash_events','keiri_expense_ignores')")"
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
want "⑨ 払った記録の鍵の決まりは増えない" "$BEFORE_PAYMENT_POLICIES" "$(q "select count(*) from pg_policies where tablename='keiri_payments'")"
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

# 入れたテストの行は、確かめが済んだら取り消す（本番ではなく、このパソコンの中の倉庫）
psql -q -c "delete from public.daily_reports where tenant_id is not null" >/dev/null 2>&1

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
  echo "OK：貼り紙は9つぜんぶ通り、何度 流しても増えません（本番ではなく、同じ形の空の倉庫での結果です）"
  exit 0
fi
echo "NG：直してから、じゅんに渡す1枚を更新してください"
exit 1
