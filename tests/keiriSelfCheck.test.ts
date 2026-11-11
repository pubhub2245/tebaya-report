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
        // 同じ日報が2回 入っている疑い（2026-11-03 に足した欄。この見本では無し）
        sameReport: null,
        noReceiptCount: null,
        any: true,
      },
    }),
  });
  assert.deepEqual(r.needsHuman, {
    unmatched: 1,
    duplicate: 3,
    // 同じ日報が2回 入っている疑い（2026-11-03 に足した欄。この見本では0組）
    duplicateReports: 0,
    noReceipt: null,
  });
  assert.ok(!JSON.stringify(r).includes("90571"));
  assert.ok(!JSON.stringify(r).includes("385000"));
  assert.ok(r.summary.includes("疑い 3件"));
});

test("読めなかったときは数字を作らず、読めなかったと返す", () => {
  const r = unreadableSelfCheck({ month: "2026年9月", ym: "2026-09", reason: "日報の棚が読めませんでした" });
  assert.equal(r.readable, false);
  assert.equal(r.reportCount, 0);
});

test("読めなかったときは、○×を「×」にしない（測っていないことを不合格にしない・2026-11-06・f1-5）", () => {
  const r = unreadableSelfCheck({ month: "2026年9月", ym: "2026-09", reason: "日報の棚が読めませんでした" });
  assert.equal(r.measurable, false, "いまは測れていない");
  // ★ここが「×」だと、読んだ人は『利益が合っていない＝不合格』と読んでしまう
  assert.equal(r.sheetReady, null);
  assert.equal(r.expenseSame, null);
  assert.equal(r.profitOk, null);
  assert.equal(r.unpaidOk, null);
  assert.equal(r.trial.ready, null);
  assert.equal(r.trial.balanced, null);
  assert.equal(r.trial.matchesScreen, null);
  assert.equal(r.cash.reconciles, null);
  assert.ok(r.summary.includes("いまは測れませんでした"));
  assert.ok(r.summary.includes("合格にも不合格にもしていません"));
});

test("読めた月は、今までどおり○×で返す（measurable は true・2026-11-06）", () => {
  const r = buildSelfCheck({ month: "2026年9月", ym: "2026-09", sheet: sheet() });
  assert.equal(r.measurable, true);
  assert.equal(typeof r.sheetReady, "boolean");
  assert.equal(typeof r.profitOk, "boolean");
  assert.equal(typeof r.expenseSame, "boolean");
});

test("同じ日報が2回 入っている疑いも、件数だけ返して言葉に出す（2026-11-03・f1-1）", () => {
  const r = buildSelfCheck({
    month: "2026年10月",
    ym: "2026-10",
    sheet: sheet({
      review: {
        unmatched: [],
        duplicate: null,
        sameReport: {
          count: 2,
          extraReports: 2,
          extraSalesYen: 45050,
          extraExpenseYen: 10317,
          groups: [
            { date: "2026-10-11", location: "ながやま三股", shop: "手羽屋", unit: "1", count: 2, salesYen: 21400 },
            { date: "2026-10-12", location: "ながやま三股", shop: "手羽屋", unit: "1", count: 2, salesYen: 23650 },
          ],
        },
        noReceiptCount: null,
        any: true,
      },
    }),
  });
  assert.equal(r.needsHuman.duplicateReports, 2);
  assert.ok(r.summary.includes("同じ日報が2回 入っている疑い 2組"), r.summary);
  // ★金額は1円も返さない（この窓口の約束）
  assert.ok(!JSON.stringify(r).includes("45050"));
  assert.ok(!JSON.stringify(r).includes("21400"));
});

test("同じ日報が2枚あるときは『問題0件』と言わない（2026-11-03 B2 の指摘・f1-5）", () => {
  const r = buildSelfCheck({
    month: "2026年10月",
    ym: "2026-10",
    sheet: sheet({
      review: {
        unmatched: [],
        duplicate: null,
        sameReport: {
          count: 2,
          extraReports: 2,
          extraSalesYen: 45050,
          extraExpenseYen: 10317,
          groups: [
            { date: "2026-10-11", location: "ニシムタ", shop: "手羽屋", unit: "1", count: 2, salesYen: 21400 },
            { date: "2026-10-12", location: "ニシムタ", shop: "手羽屋", unit: "1", count: 2, salesYen: 23650 },
          ],
        },
        noReceiptCount: null,
        any: true,
      },
    }),
  });
  assert.equal(r.problems.length, 1);
  assert.ok(r.problems[0].includes("同じ日報が2枚あるかもしれません（2組"), r.problems[0]);
  // ★1枚そのものは止めない（止めると人が決めるまで毎月の1枚が出なくなる）
  assert.equal(r.sheetReady, true);
  // ★金額は1円も返さない
  assert.ok(!JSON.stringify(r).includes("45050"));
});

test("二重が無い月は、今までどおり問題0件（増やしていない）", () => {
  const r = buildSelfCheck({
    month: "2026年9月",
    ym: "2026-09",
    sheet: sheet({
      review: { unmatched: [], duplicate: null, sameReport: null, noReceiptCount: null, any: false },
    }),
  });
  assert.deepEqual(r.problems, []);
  assert.equal(r.needsHuman.duplicateReports, 0);
});

/* ------------------------------------------------------------------ *
 *  reconciles を「実際の金庫と合った」と読ませない（2026-11-11・f1-4）
 * ------------------------------------------------------------------ */

/**
 * ■ なぜ要るか（11/11 に本番で起きた形）
 *   この窓口は同じ答えの中に2つのことを並べています。
 *     cash.reconciles … 紙の上の足し算が、画面の現金と同じ数字か
 *     cashCount       … 実際に金庫を数えた結果（countRecords 0 ＝ まだ数えていない）
 *   11/11 に外から読んだ側は、**countRecords 0・latestCountOn null なのに
 *   reconciles true** を見て「金庫の窓口が『合う』と答える」と報告しました。
 *   reconciles は金庫を1回も数えていない月でも true になるので、
 *   f1-4（実際の金庫と合うか）の合否には使えません。
 *   取り違えが起きないように、意味と「本当の合否はどこか」を同じ所に置きます。
 */
test("reconciles の意味と、f1-4 の合否がどこにあるかを必ず書く（f1-4）", () => {
  const r = buildSelfCheck({ month: "2026年9月", ym: "2026-09", sheet: sheet() });
  assert.match(r.cash.means ?? "", /実際の金庫と合ったかではありません/);
  assert.match(r.cash.means ?? "", /1回も数えていない月でも true/);
  assert.match(r.cash.safeMatchWindow ?? "", /cashcount/);
});

test("読めなかった月も、意味の説明は消えない（f1-4）", () => {
  const r = unreadableSelfCheck({ month: "2026年9月", ym: "2026-09", reason: "読めません" });
  assert.equal(r.cash.reconciles, null);
  assert.match(r.cash.means ?? "", /実際の金庫と合ったかではありません/);
  assert.match(r.cash.safeMatchWindow ?? "", /cashcount/);
});
