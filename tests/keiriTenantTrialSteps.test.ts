/**
 * 2軒目を入れる手順の 手順4・5・6（f5-4・f3-4）のテスト。
 *
 * ここが狂うと、テストの店のための行が**手羽屋の画面に混ざる**か、
 * 逆に「通った」と言ってよくない状態を合格にしてしまう。
 */
import test from "node:test";
import assert from "node:assert/strict";

import { TEST_SHOP } from "../lib/keiri/tenantTrial";
import { sheetShowsNumbers } from "../lib/keiri/tenantTrialNumbers";
import {
  TEST_LOCATION,
  TEST_REPORT,
  buildTestLocation,
  buildTestReport,
  rollbackNeeded,
  stepsAllDone,
  stepsSummary,
  testReportDate,
  type StepsState,
} from "../lib/keiri/tenantTrialSteps";
import { rowsInScope } from "../lib/tenantScope";

const TENANT = "11111111-2222-4333-8444-555555555555";

test("入れる行には必ず『どの店か』の印が付く（手羽屋の印が空の行にならない）", () => {
  const loc = buildTestLocation(TENANT) as { tenant_id?: string | null; name?: string };
  const rep = buildTestReport(TENANT) as { tenant_id?: string | null; date?: string };
  assert.equal(loc.tenant_id, TENANT);
  assert.equal(rep.tenant_id, TENANT);
  assert.notEqual(loc.tenant_id, null);
  assert.notEqual(rep.tenant_id, null);
});

test("名前の頭に【テスト】が付く（本物と見分けが付く）", () => {
  const loc = buildTestLocation(TENANT) as { name: string };
  const rep = buildTestReport(TENANT) as { location: string; staff_name: string };
  assert.ok(loc.name.startsWith("【テスト】"));
  assert.ok(rep.location.startsWith("【テスト】"));
  assert.ok(rep.staff_name.startsWith("【テスト】"));
  assert.ok(TEST_SHOP.name.startsWith("【テスト】"));
});

test("手羽屋（印が空）で絞ると、入れた行は1行も出ない", () => {
  const tebayaRow = { tenant_id: null, name: "ながやま鷹尾" };
  const rows = [
    tebayaRow,
    buildTestLocation(TENANT) as unknown as { tenant_id: string | null; name: string },
  ];
  const visible = rowsInScope(rows as { tenant_id?: string | null }[], null);
  assert.equal(visible.length, 1);
  assert.equal((visible[0] as { name: string }).name, "ながやま鷹尾");
});

test("日報の日付は、テストの店の数え始めの日と同じ", () => {
  assert.equal(testReportDate(), TEST_SHOP.openingDate);
  const rep = buildTestReport(TENANT) as { date: string };
  assert.equal(rep.date, TEST_SHOP.openingDate);
});

test("日報の中身は架空の固定値で、売上と内訳が合っている", () => {
  const rep = buildTestReport(TENANT) as {
    sales_amount: number;
    breakdown_total: number;
    breakdown_diff: number;
    expenses: { amount: number; receipt_image_url: null | string }[];
  };
  assert.equal(rep.sales_amount, TEST_REPORT.sales);
  assert.equal(rep.breakdown_total, TEST_REPORT.sales);
  assert.equal(rep.breakdown_diff, 0);
  assert.equal(rep.expenses.length, 1);
  assert.equal(rep.expenses[0].amount, TEST_REPORT.expenseAmount);
  assert.equal(rep.expenses[0].receipt_image_url, null);
});

test("出店場所の場代の決まりは『なし』（0円の行を作らない・CLAUDE.md 4-15）", () => {
  const loc = buildTestLocation(TENANT) as { booth_fee_type: string };
  assert.equal(loc.booth_fee_type, "none");
  assert.equal(TEST_LOCATION.boothFeeType, "none");
});

test("手羽屋に見える件数が動いたら取り消す", () => {
  assert.equal(rollbackNeeded({ locations: 20, reports: 184 }, { locations: 20, reports: 184 }), false);
  assert.equal(rollbackNeeded({ locations: 20, reports: 184 }, { locations: 21, reports: 184 }), true);
  assert.equal(rollbackNeeded({ locations: 20, reports: 184 }, { locations: 20, reports: 185 }), true);
});

test("数えられなかったときも取り消す（0件と読めなかったを取り違えない）", () => {
  assert.equal(rollbackNeeded({ locations: null, reports: 184 }, { locations: 20, reports: 184 }), true);
  assert.equal(rollbackNeeded({ locations: 20, reports: 184 }, { locations: 20, reports: null }), true);
});

const done: StepsState = {
  shopReady: true,
  locationReady: true,
  reportReady: true,
  separated: true,
  numbersShown: true,
};

test("手順4〜6がそろって初めて『通った』と言う", () => {
  assert.equal(stepsAllDone(done), true);
  assert.equal(stepsAllDone({ ...done, separated: false }), false);
  assert.equal(stepsAllDone({ ...done, numbersShown: false }), false);
  assert.equal(stepsAllDone({ ...done, shopReady: false }), false);
});

test("まとめの1行は、のこりを名指しする", () => {
  assert.match(stepsSummary(done), /手順4・5・6 まで通りました/);
  assert.match(stepsSummary({ ...done, shopReady: false }), /テストの店がまだありません/);
  assert.match(stepsSummary({ ...done, locationReady: false }), /手順4（出店場所）/);
  assert.match(stepsSummary({ ...done, separated: false }), /手順6/);
  assert.match(stepsSummary(done, true), /取り消しました/);
});

/* ---------- 手順5で自分の日報を入れても「分かれている」が崩れないこと ---------- */

test("テストの店の日報が1枚 入っても、分かれている判定は崩れない（よその行だけを数える）", () => {
  const { separationOk } = require("../lib/keiri/tenantTrial") as typeof import("../lib/keiri/tenantTrial");
  const tebaya = { reportCount: 15, advancesRead: true, readable: true };
  // 手順5のあと：そのお店として1件 読めるが、それは自分の行（よその行は0）
  assert.equal(
    separationOk({ tebaya, testShop: { reportCount: 1, foreignCount: 0, advancesRead: false, readable: true } }),
    true,
  );
  // 手羽屋の行が1件でも混ざったら、分かれているとは言わない
  assert.equal(
    separationOk({ tebaya, testShop: { reportCount: 1, foreignCount: 1, advancesRead: false, readable: true } }),
    false,
  );
  // よその行の数が渡されないときは、これまでどおり件数で見る
  assert.equal(
    separationOk({ tebaya, testShop: { reportCount: 1, advancesRead: false, readable: true } }),
    false,
  );
});

// --- 「今月の利益・今の現金」が出たかは、数えてから言う（2026-10-28・f5-4） ---
//   通す側の窓口は 2026-10-28 まで「日報が1枚 入った＝数字も出た」と書いていました。
//   ここは、その判定（計算だけの部分）を固定します。
test("1枚の要約に『残ったお金』と現金があれば、数字が出たと言う", () => {
  assert.equal(
    sheetShowsNumbers({
      headline: [{ label: "今月 残ったお金", yen: 19000 }],
      cash: { balance: 19000 },
    }),
    true,
  );
});

test("『残ったお金』の行が無ければ、出たとは言わない", () => {
  assert.equal(
    sheetShowsNumbers({ headline: [{ label: "売上", yen: 30000 }], cash: { balance: 0 } }),
    false,
  );
});

test("金額が数でなければ、出たとは言わない", () => {
  assert.equal(
    sheetShowsNumbers({
      headline: [{ label: "今月 残ったお金", yen: Number.NaN }],
      cash: { balance: 19000 },
    }),
    false,
  );
  assert.equal(
    sheetShowsNumbers({
      headline: [{ label: "今月 残ったお金", yen: 19000 }],
      cash: { balance: Number.NaN },
    }),
    false,
  );
});
