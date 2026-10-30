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
  MASTER_SHELF_STEP,
  REPORT_SHELF_STEP,
  decideBreakdownCheck,
  decideCumulative,
  decideDupCheck,
  decideReportEdit,
  decideReportListRead,
  decideReportSave,
  masterShelfStateOf,
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

test("一覧：手羽屋は、締めても今までどおり出す", () => {
  const v = decideReportListRead({ isTebaya: true, rows: 0, shelfState: "締まっている" });
  assert.equal(v.showList, true);
  assert.equal(v.message, null);
});

test("一覧：申し込んだお店・締まっている・0件＝「1件もありません」と見せない", () => {
  const v = decideReportListRead({ isTebaya: false, rows: 0, shelfState: "締まっている" });
  assert.equal(v.showList, false);
  assert.match(String(v.message), /1件もありませんという意味ではありません|意味ではありません/);
});

test("一覧：1件でも読めていれば出す／まだ・分からないときも出す", () => {
  assert.equal(
    decideReportListRead({ isTebaya: false, rows: 2, shelfState: "締まっている" }).showList,
    true,
  );
  for (const shelfState of ["まだ", "分からない"] as const) {
    const v = decideReportListRead({ isTebaya: false, rows: 0, shelfState });
    assert.equal(v.showList, true);
    assert.equal(v.message, null);
  }
});

test("編集：手羽屋は、締めても今までどおり直せる", () => {
  const v = decideReportEdit({ isTebaya: true, shelfState: "締まっている" });
  assert.equal(v.canEdit, true);
  assert.equal(v.message, null);
});

test("編集：申し込んだお店・締まっている＝先に止める（嘘の「保存しました」を出さない）", () => {
  const v = decideReportEdit({ isTebaya: false, shelfState: "締まっている" });
  assert.equal(v.canEdit, false);
  assert.match(String(v.message), /直せない形/);
});

test("編集：まだ締まっていない・確かめられないときは、今までどおり直せる", () => {
  for (const shelfState of ["まだ", "分からない"] as const) {
    const v = decideReportEdit({ isTebaya: false, shelfState });
    assert.equal(v.canEdit, true);
    assert.equal(v.message, null);
  }
});

/* ---------------------------------------------------------------------------
 * 商品の一覧が読めなかったとき（2026-10-30・f3-4）
 * ------------------------------------------------------------------------- */

test("手羽屋は、商品が0件でも今までどおり突き合わせる（0件は本当に0件）", () => {
  for (const shelfState of ["締まっている", "まだ", "分からない"] as const) {
    const g = decideBreakdownCheck({ isTebaya: true, productRows: 0, shelfState });
    assert.equal(g.check, true);
    assert.equal(g.allowAdd, true);
    assert.equal(g.message, null);
  }
});

test("商品が1件でも読めたときは、どちらのお店でも今までどおり突き合わせる", () => {
  for (const isTebaya of [true, false]) {
    const g = decideBreakdownCheck({ isTebaya, productRows: 7, shelfState: "締まっている" });
    assert.equal(g.check, true);
    assert.equal(g.allowAdd, true);
    assert.equal(g.message, null);
  }
});

test("申し込んだお店・⑬が流れている・0件＝読めなかった扱い（止めない・足す所も出さない）", () => {
  const g = decideBreakdownCheck({
    isTebaya: false,
    productRows: 0,
    shelfState: "締まっている",
  });
  assert.equal(g.check, false);
  assert.equal(g.allowAdd, false);
  assert.match(String(g.message), /読めませんでした/);
  // 「1件もない」と言い切らないこと（同じ商品を足させてしまうため）
  assert.match(String(g.message), /意味ではありません/);
});

test("⑬がまだ・確かめられないときは、今までどおりに倒す（開かずに閉じない）", () => {
  for (const shelfState of ["まだ", "分からない"] as const) {
    const g = decideBreakdownCheck({ isTebaya: false, productRows: 0, shelfState });
    assert.equal(g.check, true);
    assert.equal(g.allowAdd, true);
    assert.equal(g.message, null);
  }
});

test("貼り紙⑬の答えの読み取り（ある＝締まっている／まだ無い＝まだ／無ければ分からない）", () => {
  assert.equal(MASTER_SHELF_STEP, "⑬");
  assert.equal(
    masterShelfStateOf({ shelves: [{ step: "⑬", state: "ある" }] }),
    "締まっている",
  );
  assert.equal(
    masterShelfStateOf({ shelves: [{ step: "⑬", state: "まだ無い" }] }),
    "まだ",
  );
  assert.equal(masterShelfStateOf({ shelves: [{ step: "⑧", state: "ある" }] }), "分からない");
  assert.equal(masterShelfStateOf(null), "分からない");
});
