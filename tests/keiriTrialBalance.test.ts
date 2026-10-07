/**
 * 試算表（lib/keiri/trialBalance.ts）のテスト。f1-7。
 *
 * ★ここで守るのは4点。
 *   ① 試算表の**左（借方）の合計と右（貸方）の合計がぴったり同じ**になる
 *   ② 試算表から出した 売上・かかったお金・利益 が、画面（summarizeMonth）と1円も違わない
 *   ③ **会計ソフトに渡す仕訳に立替を渡し忘れると落ちる**
 *      （2026-10-07 に見つけた本物の抜け。経理画面のCSV書き出し3つが
 *        立替を渡しておらず、画面の「かかったお金」より立替ぶん少ないCSVが出ていた）
 *   ④ 試算表のCSVは4列で、最後に合計の行が付く
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  TRIAL_BALANCE_HEADERS,
  buildTrialBalance,
  checkTrialBalance,
  trialBalanceToCsv,
} from "../lib/keiri/trialBalance";
import { buildJournalRows } from "../lib/keiri/journal";
import { summarizeMonth } from "../lib/keiri/aggregate";
import { buildOneSheet } from "../lib/keiri/oneSheet";
import { TEBAYA_TEMPLATE } from "../lib/keiri/templates/tebaya";
import type {
  KeiriAdvance,
  KeiriPayment,
  KeiriReport,
  KeiriSettings,
} from "../lib/keiri/types";

const YM = "2026-09";

/** 手羽屋に近い形（日報の経費・立替・日当・家賃が全部入っている月）。数字は架空 */
const SETTINGS: KeiriSettings = {
  opening_date: "2026-08-01",
  opening_balance: 120000,
  outsourcing_rate: 0.1,
  monthly_rent: 35000,
  rent_start_month: "2026-08",
};

const REPORTS: KeiriReport[] = [
  {
    date: "2026-09-03",
    location: "ながやま三股",
    staff_name: "イデ",
    sales_amount: 62300,
    labor: 10000,
    expenses: [
      { description: "鶏もも 仕入", amount: 18400 },
      { description: "場代", amount: 6230 },
    ],
  },
  {
    date: "2026-09-12",
    location: "PASIO高城",
    staff_name: "かずき",
    sales_amount: 48100,
    labor: 10000,
    expenses: [
      { description: "片栗粉・油", amount: 7300 },
      { description: "ガソリン", amount: 4800 },
    ],
  },
];

const ADVANCES: KeiriAdvance[] = [
  { date: "2026-09-05", amount: 9800, description: "包装資材", payer: "じゅん" },
  { date: "2026-09-18", amount: 3300, description: "高速代", payer: "イデ" },
];

const PAYMENTS: KeiriPayment[] = [
  { paid_on: "2026-09-10", amount: 20000, kind: "payroll", memo: "8月ぶん" },
  { paid_on: "2026-09-10", amount: 35000, kind: "rent", memo: "8月ぶん" },
];

function rowsWithAdvances() {
  return buildJournalRows({
    ym: YM,
    reports: REPORTS,
    payments: PAYMENTS,
    template: TEBAYA_TEMPLATE,
    settings: SETTINGS,
    advances: ADVANCES,
  });
}

function summary() {
  return summarizeMonth({
    ym: YM,
    reports: REPORTS,
    template: TEBAYA_TEMPLATE,
    settings: SETTINGS,
    advances: ADVANCES,
  });
}

// ------------------------------------------------------------------
// ① 左の合計と右の合計がぴったり同じ
// ------------------------------------------------------------------

test("試算表の左（借方）の合計と右（貸方）の合計はぴったり同じ", () => {
  const trial = buildTrialBalance(rowsWithAdvances());
  assert.ok(trial.lines.length > 0, "科目が1つも出ていない");
  assert.equal(trial.debitTotal, trial.creditTotal);
  assert.equal(trial.balanced, true);
  // 1科目ごとに「借方 − 貸方 ＝ 残高」になっている
  for (const l of trial.lines) {
    assert.equal(l.balance, l.debit - l.credit, `${l.account} の残高が合わない`);
    assert.equal(l.balanceAbs, Math.abs(l.balance));
  }
});

test("現金は資産・未払金は負債・売上高は収益・それ以外は費用として並ぶ", () => {
  const trial = buildTrialBalance(rowsWithAdvances());
  const groupOf = (name: string) => trial.lines.find((l) => l.account === name)?.group;
  assert.equal(groupOf("現金"), "asset");
  assert.equal(groupOf("未払金"), "liability");
  assert.equal(groupOf("売上高"), "revenue");
  assert.equal(groupOf("仕入（材料）"), "expense");
  // 並び順は 資産 → 負債 → 収益 → 費用
  const order = ["asset", "liability", "revenue", "expense"];
  const seen = trial.lines.map((l) => order.indexOf(l.group));
  for (let i = 1; i < seen.length; i += 1) {
    assert.ok(seen[i] >= seen[i - 1], "区分の並び順が崩れている");
  }
});

// ------------------------------------------------------------------
// ② 試算表の数字は、画面（summarizeMonth）と1円も違わない
// ------------------------------------------------------------------

test("試算表の 売上・かかったお金・利益 は画面の数字と1円も違わない", () => {
  const s = summary();
  const trial = buildTrialBalance(rowsWithAdvances());
  assert.equal(trial.revenueTotal, s.sales);
  assert.equal(trial.expenseTotal, s.expenseTotal);
  assert.equal(trial.profit, s.profit);

  const check = checkTrialBalance({
    trial,
    sales: s.sales,
    expenseTotal: s.expenseTotal,
    profit: s.profit,
  });
  assert.equal(check.ok, true, check.problems.join(" / "));
  assert.deepEqual(check.problems, []);
});

test("1枚の要約にも試算表が入り、検算が通っている", () => {
  const sheet = buildOneSheet({
    ym: YM,
    monthLabel: "2026年9月",
    shopName: "手羽屋",
    reports: REPORTS,
    payments: PAYMENTS,
    advances: ADVANCES,
    settings: SETTINGS,
    template: TEBAYA_TEMPLATE,
    currentYm: YM,
  });
  assert.ok(sheet.trial.lines.length > 0);
  assert.equal(sheet.trial.balanced, true);
  assert.equal(sheet.trialCheck.ok, true, sheet.trialCheck.problems.join(" / "));
  assert.equal(sheet.verify.trialOk, true);
  assert.equal(sheet.verify.ok, true, sheet.verify.problems.join(" / "));
  // 1枚の上の数字と、試算表から出した数字が同じ
  assert.equal(sheet.trial.revenueTotal, sheet.headline[0].yen);
  assert.equal(sheet.trial.expenseTotal, sheet.expenseTotal);
});

// ------------------------------------------------------------------
// ③ 立替を渡し忘れたら、試算表の検算が落ちる（2026-10-07 の抜け）
// ------------------------------------------------------------------

test("会計ソフトに渡す仕訳に立替を渡し忘れると、試算表の検算で見つかる", () => {
  const s = summary();
  const withoutAdvances = buildJournalRows({
    ym: YM,
    reports: REPORTS,
    payments: PAYMENTS,
    template: TEBAYA_TEMPLATE,
    settings: SETTINGS,
    // ★わざと advances を渡さない（2026-10-07 まで経理画面のCSV書き出しがこの形だった）
  });
  const trial = buildTrialBalance(withoutAdvances);
  // 左右の合計は合ってしまう（1行の中で借方＝貸方だから）。だから左右だけでは見つからない
  assert.equal(trial.balanced, true);
  // 画面と突き合わせると、立替ぶん足りないことが分かる
  const advanceTotal = ADVANCES.reduce((sum, a) => sum + a.amount, 0);
  assert.equal(trial.expenseTotal, s.expenseTotal - advanceTotal);
  const check = checkTrialBalance({
    trial,
    sales: s.sales,
    expenseTotal: s.expenseTotal,
    profit: s.profit,
  });
  assert.equal(check.ok, false);
  assert.equal(check.expenseSame, false);
  assert.equal(check.salesSame, true);
});

test("経理画面のCSV書き出しは、立替を入れた1つの仕訳を使っている", () => {
  const src = readFileSync("app/keiri/page.tsx", "utf8");
  // 書き出し3つ（ふつう・MF・弥生）と試算表が、同じ journalRows を見ていること
  assert.ok(
    /const journalRows = useMemo\(/.test(src),
    "仕訳を1か所にまとめた journalRows が無い",
  );
  const rowsBuilds = src.match(/buildJournalRows\(/g) ?? [];
  assert.equal(rowsBuilds.length, 1, "仕訳を作っている所が2か所以上ある（渡し忘れの元）");
  assert.ok(/buildTrialBalance\(journalRows\)/.test(src), "試算表が同じ仕訳を見ていない");
  for (const fn of ["toCsv(rows)", "toMoneyForwardCsv(rows)", "toYayoiCsv(rows)"]) {
    assert.ok(src.includes(fn), `${fn} が見つからない`);
  }
  // 1か所しかない buildJournalRows に advances が渡っていること
  const block = src.slice(src.indexOf("const journalRows = useMemo("));
  assert.ok(
    block.slice(0, 400).includes("advances,"),
    "仕訳に立替（advances）を渡していない",
  );
});

// ------------------------------------------------------------------
// ④ 試算表のCSV
// ------------------------------------------------------------------

test("試算表のCSVは4列で、最後に合計の行が付く", () => {
  const trial = buildTrialBalance(rowsWithAdvances());
  const csv = trialBalanceToCsv(trial);
  assert.ok(csv.startsWith("﻿"), "Excel用の目印（BOM）が無い");
  const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(lines[0], TRIAL_BALANCE_HEADERS.join(","));
  assert.equal(lines.length, trial.lines.length + 2);
  const last = lines[lines.length - 1].split(",");
  assert.equal(last[0], "合計");
  assert.equal(Number(last[1]), trial.debitTotal);
  assert.equal(Number(last[2]), trial.creditTotal);
  for (const l of lines.slice(1, -1)) {
    assert.equal(l.split(",").length, 4, `列の数が4つでない: ${l}`);
  }
});

test("仕訳が0行なら試算表は空で、合計は0円（数字を作らない）", () => {
  const trial = buildTrialBalance([]);
  assert.deepEqual(trial.lines, []);
  assert.equal(trial.debitTotal, 0);
  assert.equal(trial.creditTotal, 0);
  assert.equal(trial.balanced, true);
  assert.equal(trial.revenueTotal, 0);
  assert.equal(trial.expenseTotal, 0);
  assert.equal(trial.profit, 0);
  assert.equal(trial.rowCount, 0);
});
