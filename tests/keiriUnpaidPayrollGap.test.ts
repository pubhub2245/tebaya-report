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
  payrollShopShareLine,
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

/* ───────────────────────────────────────────────────────────────
   屋号の内わけ（2026-11-16・f1-4）

   金庫は1つとして数えるので、日当の合計には**手羽屋ともも屋の両方**が入ります
   （売上も経費も立替も同じように両方ぶんが入っているので、食い違いではありません）。
   ところが金額だけが出ていると「手羽屋だけの額だ」と読めてしまい、そのつもりで
   答えると、金庫の差にもう一方の屋号ぶんがそのまま残ります（2026-11-16 に実際に
   取り違えが起きました。2026-11-04 にも同じ形がありました）。
   ですから **金額のすぐ横に内わけを出す**ことを、ここで固定します。
   ★内わけは説明の文だけです。金額は1円も分けません・1円も変えません。
   ─────────────────────────────────────────────────────────────── */

/** 屋号つきの日報を1枚つくる */
function shopReport(
  date: string,
  sales: number,
  labor: number,
  shop: string | null,
): KeiriReport {
  return { id: `${date}-${shop ?? "none"}`, date, sales_amount: sales, labor, expenses: [], shop } as KeiriReport;
}

const mixedReports = [
  shopReport("2026-09-11", 50000, 8000, "手羽屋"),
  shopReport("2026-09-13", 40000, 8000, "手羽屋"),
  shopReport("2026-09-12", 40000, 33000, "もも屋"),
  shopReport("2026-09-14", 10000, 5000, null),
];

test("日当（f1-4）: 屋号ごとの内わけを数える（金額の多い順・区分なしは最後）", () => {
  const g = measureUnpaidPayrollGap({
    reports: mixedReports,
    payments: [],
    openingDate: OPENING,
    asOf: "2026-09-30",
  });
  assert.equal(g.accrued, 54000);
  assert.equal(g.multiShop, true);
  assert.deepEqual(
    g.shops.map((s) => [s.shop, s.rows, s.amount]),
    [
      ["もも屋", 1, 33000],
      ["手羽屋", 2, 16000],
      ["区分なし", 1, 5000],
    ],
  );
});

test("日当（f1-4）: 屋号が1つだけなら内わけは出さない（読む所を増やさない）", () => {
  const g = measureUnpaidPayrollGap({
    reports: [shopReport("2026-09-11", 50000, 8000, "手羽屋")],
    payments: [],
    openingDate: OPENING,
    asOf: "2026-09-30",
  });
  assert.equal(g.multiShop, false);
  assert.equal(payrollShopShareLine(g), "");
  assert.ok(!String(unpaidPayrollGapNotice(g)).includes("内わけ"));
});

test("日当（f1-4）: 2つ以上の屋号が入っていたら、金額のすぐ横に内わけと「食い違いではない」を出す", () => {
  const g = measureUnpaidPayrollGap({
    reports: mixedReports,
    payments: [],
    openingDate: OPENING,
    asOf: "2026-09-30",
  });
  const line = payrollShopShareLine(g);
  assert.ok(line.includes("もも屋 33,000円"));
  assert.ok(line.includes("手羽屋 16,000円"));
  assert.ok(line.includes("区分なし 5,000円"));
  assert.ok(line.includes("屋号で分けずに足しています"));
  assert.ok(line.includes("食い違いではありません"));
  // 数える前の一言と、差の内わけの行にも必ず入る（押す前に見える所）
  assert.ok(String(unpaidPayrollGapNotice(g)).includes("もも屋 33,000円"));
  assert.ok(String(unpaidPayrollGapLines(g, 54000)[0]).includes("もも屋 33,000円"));
});

test("日当（f1-4）: 払った記録があるときは「屋号ごとには分けられない」と必ず書く", () => {
  const g = measureUnpaidPayrollGap({
    reports: mixedReports,
    payments: [payment("2026-09-20", 10000)],
    openingDate: OPENING,
    asOf: "2026-09-30",
  });
  assert.equal(g.paidRows, 1);
  assert.ok(payrollShopShareLine(g).includes("引いたあとの屋号ごとの分は出せません"));
});

test("日当（f1-4）: 窓口は屋号の名前も金額も返さない（数と有無だけ）", () => {
  const g = measureUnpaidPayrollGap({
    reports: mixedReports,
    payments: [],
    openingDate: OPENING,
    asOf: "2026-09-30",
  });
  const w = buildUnpaidPayrollGapWindow({ gap: g, diff: 54000 });
  const json = JSON.stringify(w);
  assert.equal(w.shops, 3);
  assert.equal(w.multiShop, true);
  assert.equal(w.shopShareShown, true);
  assert.ok(!json.includes("もも屋"));
  assert.ok(!json.includes("手羽屋"));
  assert.ok(!json.includes("33000"));
  assert.ok(!json.includes("33,000"));
  assert.ok(!json.includes("54000"));
});

test("日当（f1-4）: 読めていないときは内わけも出さない（屋号は1つ、と言わない）", () => {
  const g = measureUnpaidPayrollGap({
    reports: mixedReports,
    payments: [],
    unreadable: true,
    openingDate: OPENING,
    asOf: "2026-09-30",
  });
  assert.equal(g.readable, false);
  assert.deepEqual(g.shops, []);
  assert.equal(g.multiShop, false);
  assert.equal(payrollShopShareLine(g), "");
});

test("日当（f1-4）: ★内わけを出しても「計算上の現金」は1円も変わらない", () => {
  const before = calcCashPosition({
    reports: mixedReports,
    payments: [],
    settings,
    advances: [],
    deposits: [],
    asOf: "2026-09-30",
  });
  // 期首100,000 ＋ 売上（50,000＋40,000＋40,000＋10,000）＝ 240,000。日当は引かない
  assert.equal(before.sales, 140000);
  assert.equal(before.balance, 240000);
});
