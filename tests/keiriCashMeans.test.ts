import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildJournalRows,
  calcCashPosition,
  summarizeMonth,
  TEBAYA_TEMPLATE,
  type KeiriPayment,
  type KeiriReport,
  type KeiriSettings,
} from "../lib/keiri";
import {
  breakdownCashMeans,
  classifyCashMeans,
  meansTextOf,
} from "../lib/keiri/cashMeans";
import { cashRuleLines, notFromSafeSentence } from "../lib/keiri/cashCheck";
import { buildTrialBalance, trialBalanceCashNote } from "../lib/keiri/trialBalance";
import { buildSelfCheck, cashRuleReconciles } from "../lib/keiri/selfCheck";
import { buildMonthlySample } from "../lib/keiri/monthlySample";

/**
 * 「経費のうち、ほんとうに金庫から出た分だけを現金から引く」決まりを固定する
 * （2026-10-08・kp233・f1-4）。
 *
 * ■ なぜ要るのか
 *   9月の実データを数え直すと、経費の中に金庫から出ていないものが混ざっていた。
 *     ・立替（だれかが自分のお金で先に払った分）
 *     ・PayPay 14,609円・TRIAL プリカ 3,909円（＝現金ではない）
 *   これを現金から引くと、出ていないお金を引くことになり、
 *   「計算上の金庫残高」が同じデータから3通り読めてしまっていた。
 *
 * ■ ここで守りたいこと
 *   ① 現金から引くのは「現金で払った」分だけ
 *   ② **月の経費（利益の側）は1円も変わらない**
 *   ③ 分からない行は現金に倒す（黙って現金を増やさない）
 *   ④ 試算表の左右は、相手が未払金に変わっても合ったままにする
 */

const settings: KeiriSettings = {
  opening_date: "2026-09-01",
  opening_balance: 145000,
  outsourcing_rate: 0,
  monthly_rent: 0,
  rent_start_month: "",
};

const payments: KeiriPayment[] = [];

/** 実データに出ている書き方をそのまま写した経費（金額だけ小さくしてある） */
const reports: KeiriReport[] = [
  {
    date: "2026-09-05",
    location: "ながやま鷹尾",
    staff_name: "イデ",
    sales_amount: 100000,
    labor: 0,
    expenses: [
      { description: "肉代", amount: 10000 },
      { description: "レジ袋 PayPay払い", amount: 2000 },
      { description: "氷 かずき立替", amount: 3000 },
      { description: "油 TRIALプリカ", amount: 1000 },
    ],
  },
];

test("払い方の見分け：PayPay・プリカは現金以外、立替は立替、それ以外は現金", () => {
  assert.equal(classifyCashMeans({ description: "肉代" }), "cash");
  assert.equal(classifyCashMeans({ description: "レジ袋 PayPay払い" }), "noncash");
  assert.equal(classifyCashMeans({ description: "油 TRIALプリカ" }), "noncash");
  assert.equal(classifyCashMeans({ description: "氷 かずき立替" }), "advance");
  assert.equal(classifyCashMeans({ description: "もも屋の売上金から立替" }), "advance");
  // 空の行・分からない行は現金に倒す（いままでと同じ数え方）
  assert.equal(classifyCashMeans({ description: "" }), "cash");
  assert.equal(classifyCashMeans({ description: "よく分からない支払い" }), "cash");
});

test("払い方は「払った人」の欄に書いてあっても拾う（全角も半角も同じに読む）", () => {
  const item = { description: "飲み物", payer: "ＰａｙＰａｙ" } as never;
  assert.ok(meansTextOf(item).includes("paypay"));
  assert.equal(classifyCashMeans(item), "noncash");
});

test("払い方ごとの合計が、経費の合計とぴったり分かれる", () => {
  const b = breakdownCashMeans(reports[0].expenses);
  assert.equal(b.cash, 10000);
  assert.equal(b.noncash, 3000); // PayPay 2,000 ＋ プリカ 1,000
  assert.equal(b.advance, 3000);
  assert.equal(b.total, 16000);
  assert.equal(b.cash + b.noncash + b.advance, b.total);
  assert.equal(b.noncashCount, 2);
  assert.equal(b.advanceCount, 1);
});

test("現金から引くのは金庫から出た分だけ。月の経費は1円も変わらない", () => {
  const cash = calcCashPosition({ reports, payments, settings });
  const summary = summarizeMonth({
    ym: "2026-09",
    reports,
    template: TEBAYA_TEMPLATE,
    settings,
  });

  // 経費（利益の側）は4行ぜんぶ＝16,000円のまま
  assert.equal(cash.expenses, 16000);
  assert.equal(summary.expenseTotal, 16000);

  // 現金は「現金で払った 10,000円」しか引かない
  assert.equal(cash.expenseMeans.cash, 10000);
  assert.equal(cash.balance, 145000 + 100000 - 10000);

  // 引いていない分は消さずに持っている
  assert.equal(cash.expenseMeans.advance + cash.expenseMeans.noncash, 6000);
});

test("現金の数え方の明細は、最後の行が計算上の現金とぴったり同じ", () => {
  const cash = calcCashPosition({ reports, payments, settings });
  const lines = cashRuleLines({
    openingDate: cash.openingDate,
    openingBalance: cash.openingBalance,
    sales: cash.sales,
    expensesCash: cash.expenseMeans.cash,
    paid: cash.paid,
    advancesSettled: cash.advancesSettled,
    deposits: cash.deposits,
    balance: cash.balance,
  });
  assert.ok(lines[0].includes("145,000円"));
  assert.ok(lines.some((l) => l.includes("金庫から出た経費") && l.includes("10,000円")));
  assert.equal(lines[lines.length - 1], "＝ 計算上の現金　235,000円");
});

test("引いていないものの1文：当てはまらなければ出さない", () => {
  assert.equal(
    notFromSafeSentence({ advance: 0, advanceCount: 0, noncash: 0, noncashCount: 0 }),
    null,
  );
  const s = notFromSafeSentence({
    advance: 3000,
    advanceCount: 1,
    noncash: 3000,
    noncashCount: 2,
  });
  assert.ok(s && s.includes("3,000円") && s.includes("PayPay"));
});

test("仕訳：現金以外・立替の経費は、相手が現金ではなく未払金になる", () => {
  const rows = buildJournalRows({
    ym: "2026-09",
    reports,
    payments,
    template: TEBAYA_TEMPLATE,
    settings,
  });
  const expenseRows = rows.filter((r) => r.debitAccount !== "現金" && r.debitAccount !== "未払金");
  // 4行ぜんぶ残っている（＝かかったお金は1円も消えない）
  assert.equal(expenseRows.reduce((s, r) => s + r.debitAmount, 0), 16000);
  const cashSide = expenseRows.filter((r) => r.creditAccount === "現金");
  const accruedSide = expenseRows.filter((r) => r.creditAccount === "未払金");
  assert.equal(cashSide.reduce((s, r) => s + r.creditAmount, 0), 10000);
  assert.equal(accruedSide.reduce((s, r) => s + r.creditAmount, 0), 6000);

  // 試算表の左右は合ったまま
  const trial = buildTrialBalance(rows);
  assert.equal(trial.balanced, true);
  assert.equal(trial.expenseTotal, 16000);
});

test("試算表の現金に添える1文：月のはじめの額を足すと画面の現金と同じになる（kp243）", () => {
  // B2 の材料の数字で確かめる（50,000＋241,000−81,700＝209,300）
  const trial = buildTrialBalance([
    {
      date: "2026-09-01",
      debitAccount: "現金",
      debitAmount: 241000,
      creditAccount: "売上高",
      creditAmount: 241000,
      note: "売上",
    },
    {
      date: "2026-09-02",
      debitAccount: "仕入高",
      debitAmount: 81700,
      creditAccount: "現金",
      creditAmount: 81700,
      note: "経費",
    },
  ]);
  const note = trialBalanceCashNote({ trial, cashBalance: 209300 });
  assert.ok(note);
  assert.equal(note.movement, 241000 - 81700);
  assert.equal(note.openingCash, 50000);
  assert.ok(note.text.includes("50,000円"));
  assert.ok(note.text.includes("209,300円"));
  assert.ok(note.text.includes("いま手元にある現金"));
});

test("試算表に現金の行が無い月は、1文を出さない", () => {
  assert.equal(
    trialBalanceCashNote({ trial: buildTrialBalance([]), cashBalance: 1000 }),
    null,
  );
});

test("読むだけの窓口は、現金の数え方が合ったかを件数と○×だけで返す（f1-4）", () => {
  const sheet = buildMonthlySample();
  assert.equal(cashRuleReconciles(sheet), true);
  const check = buildSelfCheck({ month: "見本の月", ym: sheet.ym, sheet });
  assert.equal(check.cash.reconciles, true);
  assert.equal(typeof check.cash.advanceCount, "number");
  assert.equal(typeof check.cash.noncashCount, "number");
  // 金額は1文字も返さない（件数と○×だけ）
  assert.equal(JSON.stringify(check.cash).includes("円"), false);
});

test("1枚にも「現金の数え方」が入り、最後の行が手元の現金と同じ", () => {
  const sheet = buildMonthlySample();
  assert.ok(sheet.cash.ruleLines.length >= 3);
  assert.ok(sheet.cash.ruleLines[sheet.cash.ruleLines.length - 1].startsWith("＝ 計算上の現金"));
});
