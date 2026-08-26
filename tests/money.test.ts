/**
 * お金の計算のテスト。
 *
 * 本番でお金が動くアプリなので、金額の計算だけは
 * 「変更したときに壊れていないか」を自動で確かめられるようにしておく。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  sumExpenses,
  expensesTotalOf,
  calcGrossProfit,
  calcActualProfit,
  calcTakeHome,
  calcCashBalance,
  COST_RATE_FOOD,
  COST_RATE_RENT,
} from "../lib/money";

/* ---------- 経費の合計 ---------- */

test("sumExpenses: 明細の amount を足す", () => {
  assert.equal(sumExpenses([{ amount: 300 }, { amount: 45 }]), 345);
});

test("sumExpenses: 空・配列でない・壊れた値は 0 として扱う", () => {
  assert.equal(sumExpenses([]), 0);
  assert.equal(sumExpenses(null), 0);
  assert.equal(sumExpenses(undefined), 0);
  assert.equal(sumExpenses("こわれたデータ"), 0);
  assert.equal(sumExpenses([{ amount: null }, { amount: "abc" }, {}]), 0);
});

test("sumExpenses: 文字列の数字も足せる（DBから文字で返ることがある）", () => {
  assert.equal(sumExpenses([{ amount: "1200" }, { amount: 800 }]), 2000);
});

test("expensesTotalOf: expenses_total 列があればそれを使う", () => {
  // 明細を取得しなくても合計が出せる＝集計画面が写真をダウンロードせずに済む
  assert.equal(expensesTotalOf({ expenses_total: 5000 }), 5000);
  assert.equal(expensesTotalOf({ expenses_total: 0 }), 0);
});

test("expensesTotalOf: expenses_total が無ければ明細から足す", () => {
  assert.equal(expensesTotalOf({ expenses: [{ amount: 120 }] }), 120);
  assert.equal(expensesTotalOf({ expenses_total: null, expenses: [{ amount: 7 }] }), 7);
  assert.equal(expensesTotalOf({}), 0);
});

/* ---------- 粗利（推定） ---------- */

test("calcGrossProfit: 売上 −(食材25% + 日当 + 場代10%)", () => {
  const r = calcGrossProfit(100000, 10000);
  assert.equal(r.food, 25000);
  assert.equal(r.rent, 10000);
  assert.equal(r.labor, 10000);
  assert.equal(r.costTotal, 45000);
  assert.equal(r.profit, 55000);
});

test("calcGrossProfit: 端数は四捨五入する", () => {
  const r = calcGrossProfit(12345, 9000);
  assert.equal(r.food, Math.round(12345 * COST_RATE_FOOD)); // 3086
  assert.equal(r.rent, Math.round(12345 * COST_RATE_RENT)); // 1235
  assert.equal(r.profit, 12345 - (r.food + 9000 + r.rent));
});

test("calcGrossProfit: 売上0でも落ちず、赤字は負の数で返る", () => {
  const r = calcGrossProfit(0, 10000);
  assert.equal(r.profit, -10000);
});

test("calcGrossProfit: 数字でない入力は0として扱う", () => {
  const r = calcGrossProfit(NaN as unknown as number, undefined as unknown as number);
  assert.equal(r.profit, 0);
});

/* ---------- 粗利（実績） ---------- */

test("calcActualProfit: 推定を使わず実際の経費で計算する", () => {
  const r = calcActualProfit(100000, 10000, 8000);
  assert.equal(r.costTotal, 18000);
  assert.equal(r.profit, 82000);
});

test("calcActualProfit と calcGrossProfit は別物（推定と実績の差が見える）", () => {
  const sales = 100000;
  const labor = 10000;
  const estimated = calcGrossProfit(sales, labor).profit; // 55000
  const actual = calcActualProfit(sales, labor, 8000).profit; // 82000
  assert.notEqual(estimated, actual);
  assert.equal(actual - estimated, 27000);
});

/* ---------- 持ち帰り ---------- */

test("calcTakeHome: 売上 − レジから払った経費", () => {
  assert.equal(calcTakeHome(50000, 3000), 47000);
  assert.equal(calcTakeHome(0, 3000), -3000);
});

/* ---------- 手元現金 ---------- */

const reports = [
  { date: "2026-04-01", sales_amount: 50000, expenses_total: 3000 },
  { date: "2026-05-01", sales_amount: 60000, expenses_total: 5000 },
  { date: "2026-06-01", sales_amount: 70000, expenses_total: 0 },
];

test("calcCashBalance: 期首 + 売上 − 経費 − 精算済み立替", () => {
  const r = calcCashBalance({
    openingBalance: 100000,
    startDate: null,
    reports,
    advances: [{ amount: 2000, settled: true, settled_date: "2026-06-02", date: "2026-06-01" }],
  });
  assert.equal(r.salesTotal, 180000);
  assert.equal(r.expensesTotal, 8000);
  assert.equal(r.settledAdvancesTotal, 2000);
  assert.equal(r.balance, 100000 + 180000 - 8000 - 2000);
  assert.equal(r.reportCount, 3);
});

test("calcCashBalance: 未精算の立替は手元現金から引かない（まだ払っていないため）", () => {
  const r = calcCashBalance({
    openingBalance: 0,
    startDate: null,
    reports: [],
    advances: [{ amount: 9999, settled: false, settled_date: null, date: "2026-06-01" }],
  });
  assert.equal(r.unsettledAdvancesTotal, 9999);
  assert.equal(r.settledAdvancesTotal, 0);
  assert.equal(r.balance, 0);
});

test("calcCashBalance: 起点日より前の日報は対象外", () => {
  const r = calcCashBalance({
    openingBalance: 0,
    startDate: "2026-05-01",
    reports,
    advances: [],
  });
  assert.equal(r.reportCount, 2);
  assert.equal(r.salesTotal, 130000);
  assert.equal(r.expensesTotal, 5000);
});

test("calcCashBalance: 起点日より前に精算した立替は引かない", () => {
  const r = calcCashBalance({
    openingBalance: 0,
    startDate: "2026-05-01",
    reports: [],
    advances: [
      { amount: 500, settled: true, settled_date: "2026-04-10", date: "2026-04-01" },
      { amount: 700, settled: true, settled_date: "2026-05-10", date: "2026-05-01" },
    ],
  });
  assert.equal(r.settledAdvancesTotal, 700);
});

test("calcCashBalance: 精算日が無い立替は立替日で判定する", () => {
  const r = calcCashBalance({
    openingBalance: 0,
    startDate: "2026-05-01",
    reports: [],
    advances: [{ amount: 400, settled: true, settled_date: null, date: "2026-06-01" }],
  });
  assert.equal(r.settledAdvancesTotal, 400);
});

test("calcCashBalance: expenses_total が無い日報でも明細から合計できる", () => {
  const r = calcCashBalance({
    openingBalance: 0,
    startDate: null,
    reports: [{ date: "2026-04-01", sales_amount: 1000, expenses: [{ amount: 250 }] }],
    advances: [],
  });
  assert.equal(r.expensesTotal, 250);
  assert.equal(r.balance, 750);
});

test("calcCashBalance: データが空でも落ちない", () => {
  const r = calcCashBalance({
    openingBalance: 0,
    startDate: null,
    reports: [],
    advances: [],
  });
  assert.equal(r.balance, 0);
  assert.equal(r.reportCount, 0);
});
