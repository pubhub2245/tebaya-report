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
import type { WarehouseAlive } from "../lib/keiri/warehouseAlive";
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

/** 倉庫は生きている（対照が取れた）という答え */
const ALIVE: WarehouseAlive = { alive: true, state: "alive", reason: "手羽屋の行が見えました" };
/** 倉庫が読めていない（＝測れない）という答え */
const DOWN: WarehouseAlive = {
  alive: false,
  state: "unreachable",
  reason: "倉庫から返事がありませんでした",
};

function check(
  emptyShop = {
    readable: true,
    reportCount: 0,
    cashEventCount: 0,
    advancesSkipped: true,
  },
  warehouse: WarehouseAlive = ALIVE,
) {
  const { withSetup, withoutSetup } = sheets();
  return buildFirstMonthCheck({
    month: "2026年11月",
    ym: YM,
    reportDate: REPORT_DATE,
    emptyShop,
    withSetup,
    withoutSetup,
    warehouse,
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

test("倉庫が読めていないときは、合格にも不合格にもしない（0件を合格と取り違えない）", () => {
  // 2026-11-06 の朝、本番でこの形が ok: true と答えていた
  //（よその店として読んで0件・0.37秒・倉庫は止まっていた）
  const r = check(
    { readable: true, reportCount: 0, cashEventCount: 0, advancesSkipped: true },
    DOWN,
  );
  assert.equal(r.measurable, false);
  assert.equal(r.ok, null);
  assert.ok(r.summary.includes("測れません"));
  assert.ok(r.problems.some((p) => p.includes("測れません")));
});

test("倉庫が生きているときは、今までどおり合格と答える", () => {
  const r = check();
  assert.equal(r.measurable, true);
  assert.equal(r.ok, true);
  assert.equal(r.warehouse.state, "alive");
});

test("倉庫そのものが読めない日は、startsEmpty を false ではなく null にする（2026-11-07）", () => {
  const r = buildFirstMonthCheck({
    month: "2026年11月",
    ym: "2026-11",
    reportDate: REPORT_DATE,
    emptyShop: {
      readable: false,
      reportCount: 0,
      cashEventCount: 0,
      advancesSkipped: false,
    },
    ...sheets(),
    warehouse: {
      alive: false,
      state: "unreachable",
      reason: "倉庫からの返事が時間内に来ませんでした",
    },
  });
  assert.equal(r.measurable, false);
  // ★false だと「よその店の行が出ている＝不合格」と読めてしまう
  assert.equal(r.checks.startsEmpty, null);
  assert.equal(r.ok, null);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /いまは測れません/);
  // 計算だけで分かる4つは、倉庫と関係なく今までどおり答える
  assert.equal(r.checks.profitShown, true);
  assert.equal(r.checks.cashShown, true);
  assert.equal(r.checks.sheetReady, true);
  assert.equal(r.checks.noFabricatedCost, true);
});
