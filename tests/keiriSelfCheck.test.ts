/**
 * 外から確かめる窓口（/api/keiri/selfcheck）のテスト。
 *
 * ここが狂うと、**本物のデータの金額が外に漏れる**か、
 * 逆に「合っていないのに合っている」と外に言ってしまう。
 */
import test from "node:test";
import assert from "node:assert/strict";

import { buildSelfCheck, maskYen, unreadableSelfCheck } from "../lib/keiri/selfCheck";
import type { MonthlySample } from "../lib/keiri/oneSheet";

function sheet(over: Partial<MonthlySample> = {}): MonthlySample {
  return {
    monthLabel: "2026年9月",
    shopName: "",
    title: "",
    madeOnLabel: "",
    headline: [],
    profitLine: "",
    expenses: [],
    journalHeaders: [],
    journalRows: [],
    journalRowCount: 40,
    mfColumnCount: 27,
    yayoiColumnCount: 25,
    expenseTotal: 714554,
    expenseBreakdown: [],
    expenseCheck: { screen: 714554, byAccount: 714554, csv: 714554, same: true },
    cash: { balance: 0, countedOn: "", countedYen: 0 },
    unpaid: { total: 0, lines: [] },
    review: { unmatched: [], duplicate: null, noReceiptCount: null, any: false },
    trial: {
      lines: [
        {
          account: "現金",
          group: "asset",
          debit: 714554,
          credit: 714554,
          balance: 0,
          side: "なし",
          balanceAbs: 0,
        },
      ],
      debitTotal: 714554,
      creditTotal: 714554,
      balanced: true,
      revenueTotal: 714554,
      expenseTotal: 714554,
      profit: 0,
      rowCount: 40,
    },
    trialCheck: {
      balanced: true,
      salesSame: true,
      expenseSame: true,
      profitSame: true,
      ok: true,
      problems: [],
    },
    verify: {
      expenseOk: true,
      profitOk: true,
      unpaidOk: true,
      trialOk: true,
      ok: true,
      problems: [],
    },
    unmatched: [],
    reportCount: 12,
    scopeLabel: "",
    scopeShops: [],
    scopeNotes: [],
    ...over,
  } as MonthlySample;
}

test("金額は1円も外に出さない（伏せ字になる）", () => {
  assert.equal(maskYen("画面 1,234,567円／CSV 999円"), "画面 ◯円／CSV ◯円");
  assert.equal(maskYen("２，２００円"), "◯円");
  assert.equal(maskYen("合っていません。"), "合っていません。");
});

test("検算が全部合えば「1枚を出せる」と返す", () => {
  const r = buildSelfCheck({ month: "2026年9月", ym: "2026-09", sheet: sheet() });
  assert.equal(r.readable, true);
  assert.equal(r.sheetReady, true);
  assert.equal(r.expenseSame, true);
  assert.equal(r.reportCount, 12);
  assert.equal(r.csvRowCount, 40);
  assert.deepEqual(r.problems, []);
});

test("検算が合わない月は「出せない」と返し、合っていない所の金額は伏せる", () => {
  const r = buildSelfCheck({
    month: "2026年9月",
    ym: "2026-09",
    sheet: sheet({
      expenseCheck: { screen: 714554, byAccount: 714554, csv: 700000, same: false },
      verify: {
        expenseOk: false,
        profitOk: true,
        unpaidOk: true,
        ok: false,
        problems: ["かかったお金の数え方が3か所でそろっていません（画面 714,554円／会計ソフトに渡す表 700,000円）。"],
      },
    }),
  });
  assert.equal(r.sheetReady, false);
  assert.equal(r.expenseSame, false);
  assert.ok(!r.problems[0].includes("714"));
  assert.ok(r.problems[0].includes("◯円"));
});

test("人に確かめてもらうものは件数だけ返す（金額は返さない）", () => {
  const r = buildSelfCheck({
    month: "2026年9月",
    ym: "2026-09",
    sheet: sheet({
      review: {
        unmatched: [{ date: "2026-09-01", description: "不明", amount: 1000 }],
        duplicate: {
          count: 3,
          sameMonthYen: 90571,
          crossMonthYen: 385000,
          expenseAfter: 0,
          profitAfter: 0,
        },
        noReceiptCount: null,
        any: true,
      },
    }),
  });
  assert.deepEqual(r.needsHuman, { unmatched: 1, duplicate: 3, noReceipt: null });
  assert.ok(!JSON.stringify(r).includes("90571"));
  assert.ok(!JSON.stringify(r).includes("385000"));
  assert.ok(r.summary.includes("疑い 3件"));
});

test("読めなかったときは数字を作らず、読めなかったと返す", () => {
  const r = unreadableSelfCheck({ month: "2026年9月", ym: "2026-09", reason: "日報の棚が読めませんでした" });
  assert.equal(r.readable, false);
  assert.equal(r.sheetReady, false);
  assert.equal(r.reportCount, 0);
});
