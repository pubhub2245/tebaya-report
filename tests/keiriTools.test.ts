/**
 * 無料の計算ツールの計算を固定する。
 * ここが狂うと、外の人に間違った「赤字ライン」を見せてしまう。
 */
import test from "node:test";
import assert from "node:assert/strict";

import { calcBreakEven, calcFl, ratePercent, toNumber, yen } from "../lib/keiri/tools";

test("入力の掃除：空・マイナス・カンマ・単位つきを直す", () => {
  assert.equal(toNumber("1,200円"), 1200);
  assert.equal(toNumber("30%"), 30);
  assert.equal(toNumber(""), 0);
  assert.equal(toNumber("あ"), 0);
  assert.equal(toNumber(-5), 0);
});

test("割合：売上が0なら答えを出さない（0で割らない）", () => {
  assert.equal(ratePercent(30, 100), 30);
  assert.equal(ratePercent(1, 3), 33.3);
  assert.equal(ratePercent(30, 0), null);
});

test("原価率・人件費率・FL比率", () => {
  const r = calcFl(1_000_000, 300_000, 280_000);
  assert.equal(r.foodRate, 30);
  assert.equal(r.laborRate, 28);
  assert.equal(r.flRate, 58);
  assert.equal(r.remainYen, 420_000);
});

test("赤字ライン：固定費60万・変動費率40%なら月100万", () => {
  const r = calcBreakEven({
    fixedCostYen: 600_000,
    variableRatePercent: 40,
    openDays: 25,
    averageSpendYen: 2_000,
  });
  assert.equal(r.monthlySalesYen, 1_000_000);
  assert.equal(r.dailySalesYen, 40_000);
  assert.equal(r.dailyCustomers, 20);
  assert.equal(r.impossibleReason, null);
});

test("赤字ライン：端数は切り上げる（足りない額を出さない）", () => {
  const r = calcBreakEven({
    fixedCostYen: 500_000,
    variableRatePercent: 33,
    openDays: 20,
    averageSpendYen: 0,
  });
  // 500000 ÷ 0.67 = 746268.65… → 切り上げ
  assert.equal(r.monthlySalesYen, 746_269);
  assert.equal(r.dailySalesYen, 37_314);
  // 客単価が空のときは客数を出さない
  assert.equal(r.dailyCustomers, null);
});

test("変動費率が100%以上のときは答えを出さずに理由を返す", () => {
  const r = calcBreakEven({
    fixedCostYen: 300_000,
    variableRatePercent: 100,
    openDays: 25,
    averageSpendYen: 1_500,
  });
  assert.equal(r.monthlySalesYen, null);
  assert.ok(r.impossibleReason && r.impossibleReason.includes("100%"));
});

test("営業日数が空なら1日あたりは出さない", () => {
  const r = calcBreakEven({ fixedCostYen: 300_000, variableRatePercent: 30, openDays: 0, averageSpendYen: 1_000 });
  assert.equal(r.dailySalesYen, null);
  assert.equal(r.dailyCustomers, null);
});

test("円の表示", () => {
  assert.equal(yen(1234567), "1,234,567円");
});
