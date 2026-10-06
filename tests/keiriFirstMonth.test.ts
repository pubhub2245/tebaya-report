/**
 * まっさらなお店＋日報1枚で「今月の利益・今の現金」が出るか（f3-3）のテスト。
 *
 * ここが狂うと、新しいお店に数字が出ないまま「出ます」と言ってしまう。
 */
import test from "node:test";
import assert from "node:assert/strict";

import { buildOneSheet } from "../lib/keiri/oneSheet";
import {
  buildFirstMonthCheck,
  firstMonthExpenseSum,
  firstMonthReports,
  firstMonthSettings,
  hasFabricatedCost,
  FIRST_MONTH_OPENING_BALANCE,
  FIRST_MONTH_REPORT,
  FIRST_MONTH_SHOP_NAME,
} from "../lib/keiri/firstMonth";
import { templateFor, TENANT_FALLBACK_SETTINGS } from "../lib/keiri/index";
import { businessCodeForScope } from "../lib/tenantScope";

const NOBODY = "00000000-0000-4000-8000-000000000000";
const REPORT_DATE = "2026-11-04";
const YM = "2026-11";

function sheets() {
  const common = {
    ym: YM,
    monthLabel: "2026年11月",
    shopName: FIRST_MONTH_SHOP_NAME,
    reports: firstMonthReports(REPORT_DATE),
    payments: [],
    advances: [],
    template: templateFor(businessCodeForScope(NOBODY)),
    madeOn: REPORT_DATE,
    cashEvents: [],
  };
  return {
    withSetup: buildOneSheet({ ...common, settings: firstMonthSettings(REPORT_DATE) }),
    withoutSetup: buildOneSheet({ ...common, settings: TENANT_FALLBACK_SETTINGS }),
  };
}

function check(emptyShop = {
  readable: true,
  reportCount: 0,
  cashEventCount: 0,
  advancesSkipped: true,
}) {
  const { withSetup, withoutSetup } = sheets();
  return buildFirstMonthCheck({
    month: "2026年11月",
    ym: YM,
    reportDate: REPORT_DATE,
    emptyShop,
    withSetup,
    withoutSetup,
  });
}

test("日報1枚でも、今月の利益と今の現金が出る", () => {
  const r = check();
  assert.equal(r.afterOneReport.reportCount, 1);
  assert.equal(r.afterOneReport.sales, FIRST_MONTH_REPORT.sales);
  assert.equal(
    r.afterOneReport.profit,
    r.afterOneReport.sales - r.afterOneReport.expenseTotal,
  );
  assert.equal(
    r.afterOneReport.cashBalance,
    FIRST_MONTH_OPENING_BALANCE + FIRST_MONTH_REPORT.sales - firstMonthExpenseSum(),
  );
  assert.equal(r.checks.profitShown, true);
  assert.equal(r.checks.cashShown, true);
  assert.equal(r.checks.sheetReady, true);
  assert.equal(r.ok, true);
});

test("設定がまだ読めないときも、払っていない家賃・外注費を作らない", () => {
  const { withoutSetup } = sheets();
  assert.equal(hasFabricatedCost(withoutSetup), false);
  assert.equal(check().checks.noFabricatedCost, true);
});

test("まっさらなお店として読んだのに行が出たら、合格にしない", () => {
  const r = check({
    readable: true,
    reportCount: 3,
    cashEventCount: 0,
    advancesSkipped: true,
  });
  assert.equal(r.checks.startsEmpty, false);
  assert.equal(r.ok, false);
  assert.ok(r.problems.length > 0);
});

test("倉庫から読めなかったときは、合格にしない（0件と取り違えない）", () => {
  const r = check({
    readable: false,
    reportCount: 0,
    cashEventCount: 0,
    advancesSkipped: true,
  });
  assert.equal(r.checks.startsEmpty, false);
  assert.equal(r.ok, false);
});

test("手羽屋の実データは1円も使わない（材料は架空のお店のものだけ）", () => {
  const reports = firstMonthReports(REPORT_DATE);
  assert.equal(reports.length, 1);
  assert.ok(FIRST_MONTH_SHOP_NAME.includes("架空"));
  // 手羽屋だけの言葉（店名・出店場所）が材料に入っていないこと
  const text = JSON.stringify(reports);
  for (const word of ["手羽屋", "もも屋", "ながやま", "PASIO"]) {
    assert.equal(text.includes(word), false);
  }
});
