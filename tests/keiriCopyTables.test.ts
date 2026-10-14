import assert from "node:assert/strict";
import test from "node:test";

import {
  COPY_CLOSED,
  COPY_OPEN,
  COPY_UNKNOWN,
  copyTablesOf,
  isCopyTableName,
  isForeignTable,
  summarizeCopyTables,
  verdictFromAnonRead,
} from "../lib/keiri/copyTables";
import { KNOWN_COPY_TABLES, namesFromOpenApi } from "../lib/keiri/copyProbe";

/**
 * 「手羽屋のデータの写しが、工事の外に置かれていないか」の見分けを固定する（f3-4）。
 *
 * いちばん大事なのは **いま使っている棚を写しと呼ばないこと**。
 * 取り違えると、手羽屋が毎日使う画面に鍵をかけてしまう。
 */

test("2026-10-13 に見つかった日報の控えは、写しとして拾える", () => {
  assert.equal(isCopyTableName("daily_reports_backup_20260902"), true);
  assert.equal(isCopyTableName("receipt_migration_backup"), true);
});

test("いま使っている棚は、1つも写しと呼ばない", () => {
  const live = [
    "daily_reports",
    "expenses",
    "shifts",
    "locations",
    "staff_members",
    "sale_products",
    "advance_expenses",
    "keiri_advance_expenses",
    "keiri_account_mapping",
    "keiri_applications",
    "keiri_tenants",
    "keiri_settings",
    "keiri_payments",
    "keiri_cash_events",
    "keiri_expense_ignores",
    "customer_line_messages",
    "customer_line_events",
    "line_groups",
    "feedback_box",
    "feedback_replies",
    "agenda_items",
    "venue_inquiries",
    "location_rank_history",
    "site_visits",
  ];
  for (const name of live) {
    assert.equal(isCopyTableName(name), false, `${name} を写しと呼んではいけない`);
  }
});

test("別のアプリの棚（pkmn_…）は、名前が当てはまっても触らない", () => {
  assert.equal(isForeignTable("pkmn_entries"), true);
  assert.equal(isCopyTableName("pkmn_entries_backup_20260823"), false);
  assert.equal(isForeignTable("daily_reports"), false);
});

test("写しの名前のかたちを、ひととおり拾える", () => {
  for (const n of [
    "daily_reports_bak",
    "expenses_copy",
    "locations_old",
    "daily_reports_snapshot",
    "table_snapshots",
    "deleted_tasks_20260827",
    "daily_reports_20260902",
    "daily_reports_202609",
  ]) {
    assert.equal(isCopyTableName(n), true, `${n} は写し`);
  }
});

test("似ているが写しではない名前を拾わない（取り違え防止）", () => {
  // 「old」「bak」が語の一部として入っているだけのもの
  for (const n of ["goldfish", "bakery_sales", "copyright_notes", "households"]) {
    assert.equal(isCopyTableName(n), false, `${n} は写しではない`);
  }
});

test("並んでいる名前から、写しだけを名前順で拾う", () => {
  const got = copyTablesOf([
    "daily_reports",
    "daily_reports_backup_20260902",
    "receipt_migration_backup",
    "daily_reports",
    "shifts",
  ]);
  assert.deepEqual(got, ["daily_reports_backup_20260902", "receipt_migration_backup"]);
});

test("これまでに見つかっている写しは、必ず見分けを通る（一覧が読めない日でも聞ける）", () => {
  for (const t of KNOWN_COPY_TABLES) assert.equal(isCopyTableName(t), true, t);
});

test("読み方は逆：読めてしまったら『まだ開いている』", () => {
  const open = verdictFromAnonRead({ table: "x_backup", ok: true });
  assert.equal(open.state, COPY_OPEN);
});

test("断られた・棚が無いときは『読めません』", () => {
  assert.equal(
    verdictFromAnonRead({ table: "x_backup", ok: false, code: "42501" }).state,
    COPY_CLOSED,
  );
  assert.equal(
    verdictFromAnonRead({ table: "x_backup", ok: false, code: "42P01" }).state,
    COPY_CLOSED,
  );
  assert.equal(
    verdictFromAnonRead({
      table: "x_backup",
      ok: false,
      code: null,
      message: "Could not find the table 'public.x_backup'",
    }).state,
    COPY_CLOSED,
  );
});

test("聞けなかったときは『分かりません』にして、閉まったことにしない", () => {
  const v = verdictFromAnonRead({
    table: "x_backup",
    ok: false,
    code: "500",
    message: "upstream connect error",
  });
  assert.equal(v.state, COPY_UNKNOWN);
  const sum = summarizeCopyTables([v]);
  assert.equal(sum.allClosed, false, "分からないものがあるのに『ぜんぶ閉まった』にしてはいけない");
});

test("1つでも開いていれば、ぜんぶ閉まったとは言わない", () => {
  const sum = summarizeCopyTables([
    { table: "a_backup", state: COPY_OPEN, note: "" },
    { table: "b_backup", state: COPY_CLOSED, note: "" },
  ]);
  assert.equal(sum.allClosed, false);
  assert.equal(sum.open, 1);
  assert.equal(sum.closed, 1);
  assert.match(sum.summary, /まだ読めます|まだ/);
});

test("ぜんぶ閉まっていれば、そう言う", () => {
  const sum = summarizeCopyTables([
    { table: "a_backup", state: COPY_CLOSED, note: "" },
    { table: "b_backup", state: COPY_CLOSED, note: "" },
  ]);
  assert.equal(sum.allClosed, true);
  assert.equal(sum.open, 0);
});

test("棚の名前の一覧は、形が違えば空で返す（推測で埋めない）", () => {
  assert.deepEqual(namesFromOpenApi(null), []);
  assert.deepEqual(namesFromOpenApi({ hello: 1 }), []);
  assert.deepEqual(
    namesFromOpenApi({ definitions: { daily_reports: {}, daily_reports_backup_20260902: {} } }),
    ["daily_reports", "daily_reports_backup_20260902"],
  );
  assert.deepEqual(namesFromOpenApi({ paths: { "/": {}, "/shifts": {}, "/rpc/foo": {} } }), [
    "shifts",
  ]);
});
