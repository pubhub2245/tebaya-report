/**
 * 申し込んだお店が「日報を1枚 出す」ときの決まり
 * （lib/keiri/tenantReportWrite.ts・2026-10-19・f3-3・f3-4）。
 *
 * ■ ここで固定すること
 *   ① **手羽屋は1行も変わらない**（読み返す・0件は本当に0件・合計に1行も添えない）
 *   ② 申し込んだお店は**読み返さない**（行は入っているのに「保存に失敗」と出さない）
 *   ③ 棚が締まっているときの「0件」を、**本当の0件と取り違えない**
 *   ④ 締まったか確かめられないときは、**今までどおり**に倒す（開かずに閉じない）
 *   ※ 数字は作り物です（実在のお店の金額は置きません）。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  REPORT_SHELF_STEP,
  decideCumulative,
  decideDupCheck,
  decideReportSave,
  reportShelfStateOf,
} from "../lib/keiri/tenantReportWrite";

test("手羽屋は、入れたあと今までどおり番号を読み返す", () => {
  const v = decideReportSave({ isTebaya: true });
  assert.equal(v.readBack, true);
});

test("申し込んだお店は、番号を読み返さない（嘘の「保存に失敗」を出さない）", () => {
  const v = decideReportSave({ isTebaya: false });
  assert.equal(v.readBack, false);
});

test("もうある日報が読めたときは、どちらのお店でも聞く", () => {
  for (const isTebaya of [true, false]) {
    const v = decideDupCheck({ isTebaya, rows: 1, shelfState: "分からない" });
    assert.equal(v.found, true);
    assert.equal(v.checked, true);
    assert.match(String(v.message), /すでに登録されています/);
  }
});

test("手羽屋の0件は、本当に0件（締まっていても聞かない）", () => {
  const v = decideDupCheck({ isTebaya: true, rows: 0, shelfState: "締まっている" });
  assert.equal(v.found, false);
  assert.equal(v.checked, true);
  assert.equal(v.message, null);
});

test("申し込んだお店・締まっている・0件＝「確かめられませんでした」と出す", () => {
  const v = decideDupCheck({ isTebaya: false, rows: 0, shelfState: "締まっている" });
  assert.equal(v.found, false);
  assert.equal(v.checked, false);
  assert.match(String(v.message), /確かめられませんでした/);
});

test("まだ締まっていない・確かめられないときは、今までどおり通す", () => {
  for (const shelfState of ["まだ", "分からない"] as const) {
    const v = decideDupCheck({ isTebaya: false, rows: 0, shelfState });
    assert.equal(v.found, false);
    assert.equal(v.checked, true);
    assert.equal(v.message, null);
  }
});

test("累計売上：手羽屋は1行も添えない", () => {
  const v = decideCumulative({
    isTebaya: true,
    rowCount: 0,
    sumFromShelf: 0,
    typed: 12000,
    shelfState: "締まっている",
  });
  assert.equal(v.value, 12000);
  assert.equal(v.note, null);
});

test("累計売上：申し込んだお店・締まっている・0件＝読めていないと正直に出す", () => {
  const v = decideCumulative({
    isTebaya: false,
    rowCount: 0,
    sumFromShelf: 0,
    typed: 12000,
    shelfState: "締まっている",
  });
  assert.equal(v.value, 12000);
  assert.match(String(v.note), /この日の売上だけ/);
});

test("累計売上：1件でも読めていれば、今までどおり足すだけ", () => {
  const v = decideCumulative({
    isTebaya: false,
    rowCount: 3,
    sumFromShelf: 90000,
    typed: 12000,
    shelfState: "締まっている",
  });
  assert.equal(v.value, 102000);
  assert.equal(v.note, null);
});

test("貼り紙の答えの読み方（⑧の段だけを見る）", () => {
  assert.equal(REPORT_SHELF_STEP, "⑧");
  assert.equal(
    reportShelfStateOf({ shelves: [{ step: "⑧", state: "ある" }] }),
    "締まっている",
  );
  assert.equal(
    reportShelfStateOf({ shelves: [{ step: "⑧", state: "まだ無い" }] }),
    "まだ",
  );
  // ほかの段の答えを間違って読まない
  assert.equal(
    reportShelfStateOf({ shelves: [{ step: "⑫", state: "ある" }] }),
    "分からない",
  );
  assert.equal(reportShelfStateOf(null), "分からない");
  assert.equal(reportShelfStateOf({}), "分からない");
});
