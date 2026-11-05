/**
 * 「日当のうち、まだ払った記録が無い分」の数え方を固定する試験（2026-11-05・f1-4）。
 *
 * ここで守りたいのは4つです：
 *   ① 「計算上の現金」を1円も変えないこと（名前を付けて出すだけ）
 *   ② 読めていないときに「0件」と言わないこと
 *   ③ 金庫のほうが**多い**側の差に、この説明を出さないこと（起こりえないため）
 *   ④ 外から確かめる窓口が、金額を1円も返さないこと
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { calcCashPosition } from "../lib/keiri/aggregate";
import { defaultSettingsFor } from "../lib/keiri/index";
import type { KeiriPayment, KeiriReport, KeiriSettings } from "../lib/keiri/types";
import {
  buildUnpaidPayrollGapWindow,
  measureUnpaidPayrollGap,
  unpaidPayrollFit,
  unpaidPayrollGapLines,
  unpaidPayrollGapNotice,
} from "../lib/keiri/unpaidPayrollGap";

const OPENING = "2026-09-10";

const settings: KeiriSettings = {
  ...defaultSettingsFor("tebaya"),
  opening_date: OPENING,
  opening_balance: 100000,
};

/** 日当つきの日報を1枚つくる */
function report(date: string, sales: number, labor: number): KeiriReport {
  return { id: date, date, sales_amount: sales, labor, expenses: [] } as KeiriReport;
}

function payment(paidOn: string, amount: number): KeiriPayment {
  return { id: paidOn, kind: "payroll", paid_on: paidOn, amount } as KeiriPayment;
}

  const reports = [
    report("2026-09-11", 50000, 8000),
    report("2026-09-12", 40000, 16000),
    // 数え始めの日より前（数えない）
    report("2026-09-01", 30000, 8000),
  ];

test("日当（f1-4）: 期首日からの日当を足し、払った記録のぶんだけ引く", () => {
    const gap = measureUnpaidPayrollGap({
      reports,
      payments: [payment("2026-09-20", 10000)],
      openingDate: OPENING,
      asOf: "2026-09-30",
    });
    assert.equal(gap.readable, true);
    // 9/1 の 8,000円 は入らない
    assert.equal(gap.rows, 2);
    assert.equal(gap.accrued, 24000);
    assert.equal(gap.paidRows, 1);
    assert.equal(gap.paid, 10000);
    assert.equal(gap.unpaid, 14000);
    assert.equal(gap.firstDate, "2026-09-11");
    assert.equal(gap.lastDate, "2026-09-12");
  });

test("日当（f1-4）: 数えた日より後の日当は数えない", () => {
    const gap = measureUnpaidPayrollGap({
      reports,
      payments: [],
      openingDate: OPENING,
      asOf: "2026-09-11",
    });
    assert.equal(gap.rows, 1);
    assert.equal(gap.accrued, 8000);
    assert.equal(gap.unpaid, 8000);
  });

test("日当（f1-4）: 払った記録のほうが多くても、マイナスにはしない", () => {
    const gap = measureUnpaidPayrollGap({
      reports,
      payments: [payment("2026-09-20", 99999)],
      openingDate: OPENING,
      asOf: "2026-09-30",
    });
    assert.equal(gap.unpaid, 0);
    assert.equal(unpaidPayrollGapNotice(gap), "");
    assert.deepEqual(unpaidPayrollGapLines(gap, 5000), []);
  });

test("日当（f1-4）: 読めていないときは「0件」と言わない（行も一言も出さない）", () => {
    const gap = measureUnpaidPayrollGap({
      reports,
      payments: [],
      unreadable: true,
      openingDate: OPENING,
      asOf: "2026-09-30",
    });
    assert.equal(gap.readable, false);
    assert.equal(gap.rows, 0);
    assert.equal(unpaidPayrollGapNotice(gap), "");
    assert.deepEqual(unpaidPayrollGapLines(gap, 20000), []);
    const w = buildUnpaidPayrollGapWindow({ gap, diff: 20000 });
    assert.equal(w.shown, false);
    assert.ok(String(w.note).includes("0件という意味ではありません"));
  });

  const gap = measureUnpaidPayrollGap({
    reports,
    payments: [],
    openingDate: OPENING,
    asOf: "2026-09-30",
  });

test("日当（f1-4）: 差が残りとぴったり同じなら exact、小さければ within、大きければ no", () => {
    assert.equal(gap.unpaid, 24000);
    assert.equal(unpaidPayrollFit(gap, 24000), "exact");
    assert.equal(unpaidPayrollFit(gap, 23500), "near");
    assert.equal(unpaidPayrollFit(gap, 10000), "within");
    assert.equal(unpaidPayrollFit(gap, 99999), "no");
  });

test("日当（f1-4）: 金庫のほうが多い側（マイナスの差）には、この説明を出さない", () => {
    assert.equal(unpaidPayrollFit(gap, -24000), "no");
    assert.deepEqual(unpaidPayrollGapLines(gap, -24000), []);
    const w = buildUnpaidPayrollGapWindow({ gap, diff: -24000 });
    assert.equal(w.shown, false);
    assert.ok(String(w.note).includes("金庫のほうが多い側"));
  });

test("日当（f1-4）: 差が1,000円未満のときは行を出さない", () => {
    assert.deepEqual(unpaidPayrollGapLines(gap, 500), []);
    assert.equal(buildUnpaidPayrollGapWindow({ gap, diff: 500 }).shown, false);
  });

test("日当（f1-4）: 数える前の一言は、押す前に出す（金額と件数の事実だけ）", () => {
    const notice = unpaidPayrollGapNotice(gap);
    assert.ok(String(notice).includes("2件"));
    assert.ok(String(notice).includes("24,000円"));
    assert.ok(String(notice).includes("払った記録は1件もありません"));
    // 「もうお渡しした」と決めつけない
    assert.ok(String(notice).includes("お渡ししている分があると"));
  });

test("日当（f1-4）: 差の内わけの行は、ぴったり同じときに「ここだけで説明がつく」と言う", () => {
    const lines = unpaidPayrollGapLines(gap, 24000);
    assert.equal(lines.length, 3);
    assert.ok(String(lines[2]).includes("ぴったり同じ金額"));
    assert.ok(String(lines[2]).includes("ほかを探す前に"));
  });

test("日当（f1-4）: 外から確かめる窓口は、金額を1円も返さない", () => {
    const w = buildUnpaidPayrollGapWindow({ gap, diff: 24000 });
    const json = JSON.stringify(w);
    assert.equal(w.hasUnpaid, true);
    assert.equal(w.shown, true);
    assert.equal(w.fit, "exact");
    // 金額そのもの（24000・24,000）が1つも入っていないこと
    assert.ok(!String(json).includes("24000"));
    assert.ok(!String(json).includes("24,000"));
    assert.ok(!String(json).includes("8000"));
  });

test("日当（f1-4）: ★「計算上の現金」は1円も変わらない（名前を付けて出すだけ）", () => {
    const withGap = calcCashPosition({
      reports,
      payments: [],
      settings,
      advances: [],
      deposits: [],
      asOf: "2026-09-30",
    });
    // 期首100,000 ＋ 売上（9/11 50,000 ＋ 9/12 40,000）＝ 190,000。
    // 日当 24,000円 は引かない（まだ払った記録が無いので、まだ金庫にあるはず）
    assert.equal(withGap.sales, 90000);
    assert.equal(withGap.balance, 190000);
    // 払った記録を1件 足すと、そこで初めて引かれる（＝今までどおりの決まり）
    const paid = calcCashPosition({
      reports,
      payments: [payment("2026-09-20", 10000)],
      settings,
      advances: [],
      deposits: [],
      asOf: "2026-09-30",
    });
    assert.equal(paid.balance, 180000);
  });
