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
create table if not exists public.shifts (id bigserial primary key, date date, staff_name text, location text);
insert into public.shifts (date, staff_name, location) values ('2026-08-01','テスト','テスト広場');
insert into public.daily_reports (date, location, staff_name, shop, sales_amount, expenses) values
 ('2026-09-05','テスト広場','テスト','手羽屋', 34050,
  '[{"description":"仕入","amount":12000,"receipt_image_url":"https://example/x.jpg"},{"description":"場代","amount":3405}]'::jsonb);
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
BEFORE_BACKUP="$(q "select count(*) from public.daily_reports_backup_20260902")"

# --- 貼り紙を3回 流す ---------------------------------------------------------
for i in 1 2 3; do
  psql -v ON_ERROR_STOP=1 -f "$SHEET" >"$WORK/run$i.log" 2>&1
  rc=$?
  want "$i 回目が最後まで通る" "0" "$rc"
  if [ "$i" = "1" ]; then
    grep -q "⑥ テストの店の初回設定：ok" "$WORK/run$i.log" \
      && say "⑥ テストのお店ができた" "OK" || say "⑥ テストのお店ができた" "NG"
    grep -q "⑦ 日報の古い控えに鍵をかけました" "$WORK/run$i.log" \
      && say "⑦ 控えに鍵をかけた" "OK" || say "⑦ 控えに鍵をかけた" "NG"
  else
    grep -q "⑥ テストの店は、もうありました" "$WORK/run$i.log" \
      && say "$i 回目は増やさない" "OK" || say "$i 回目は増やさない" "NG"
    grep -q "⑦ 鍵をかける控えはありませんでした" "$WORK/run$i.log" \
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
want "日報は1行も変わらない（件数／印つき）" "$BEFORE_REPORTS" "$(q "select count(*)||'/'||count(tenant_id) from public.daily_reports")"
want "シフトの印も空のまま" "0" "$(q "select count(tenant_id) from public.shifts")"
want "⑦ 日報の古い控えに鍵がかかった" "t" "$(q "select relrowsecurity from pg_class where relname='daily_reports_backup_20260902'")"
want "⑦ その控えの決まりは0本（サーバー側の鍵だけ）" "0" "$(q "select count(*) from pg_policies where tablename='daily_reports_backup_20260902'")"
want "⑦ 控えの中身は1行も減らない" "$BEFORE_BACKUP" "$(q "select count(*) from public.daily_reports_backup_20260902")"

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
  echo "OK：貼り紙は7つぜんぶ通り、何度 流しても増えません（本番ではなく、同じ形の空の倉庫での結果です）"
  exit 0
fi
echo "NG：直してから、じゅんに渡す1枚を更新してください"
exit 1
