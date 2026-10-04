/**
 * 「1枚の要約」を本物のお店の数字で出す道（lib/keiri/oneSheet.ts ＋ /keiri/monthly）のテスト。
 *
 * ★ここで守るのは5点（2026-10-04・kp231・f1-5）。
 *   ① 1枚の要約は **本物の画面と同じ関数の答えと1円も違わない**
 *      （1枚のために数字を書き写した瞬間に落ちる）
 *   ② 月の経費が **画面・科目ごとの内訳・会計ソフト向けCSV の3か所で同じ**
 *      （手羽屋に近い形のデータ——日報の経費・立替・日当・家賃の全部入り——で確かめる）
 *   ③ 見本（架空のお店）と本物の1枚が **同じ関数・同じ見た目の部品**を通る
 *   ④ 本物の1枚は **合言葉の内側**にあり、**架空のお店のデータを混ぜない**
 *   ⑤ 読むところは1か所（lib/keiri/loadMonth.ts）で、**書き込みをしない**
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildOneSheet, sheetYen } from "../lib/keiri/oneSheet";
import { buildMonthlySample } from "../lib/keiri/monthlySample";
import {
  calcCashPosition,
  calcUnpaid,
  mergedExpenseByAccount,
  summarizeMonth,
} from "../lib/keiri/aggregate";
import { DISPLAY_EXPENSE_ACCOUNTS } from "../lib/keiri/accounts";
import { buildJournalRows, journalExpenseTotal } from "../lib/keiri/journal";
import { TEBAYA_TEMPLATE } from "../lib/keiri/templates/tebaya";
import { sheetShopName } from "../lib/keiri/index";
import type {
  KeiriAdvance,
  KeiriPayment,
  KeiriReport,
  KeiriSettings,
} from "../lib/keiri/types";

const YM = "2026-09";

/**
 * 手羽屋の9月に近い形のデータ（架空の数字）。
 * ★本物の数字をここに写すのではなく、**本物と同じ形**（日報の経費・立替・日当・家賃が
 *   全部入っている月）を作って、数え方がどこでもずれないことを確かめます。
 */
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
      { description: "場代", amount: 2200 },
      { description: "ガソリン", amount: 4800 },
    ],
  },
  {
    date: "2026-09-20",
    location: "マンガ倉庫",
    staff_name: "なぎさ",
    sales_amount: 73500,
    labor: 10000,
    expenses: [
      { description: "鶏手羽 仕入", amount: 22100 },
      { description: "よく分からない支払い", amount: 1500 },
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

function inputs() {
  return {
    ym: YM,
    monthLabel: "2026年9月",
    shopName: "手羽屋",
    reports: REPORTS,
    payments: PAYMENTS,
    advances: ADVANCES,
    settings: SETTINGS,
    template: TEBAYA_TEMPLATE,
    currentYm: YM,
  };
}

// ------------------------------------------------------------------
// ① 1枚の要約の数字は、本物の関数の答えと1円も違わない
// ------------------------------------------------------------------

test("1枚の要約の数字は、画面が呼ぶのと同じ関数の答えと完全に一致する", () => {
  const sheet = buildOneSheet(inputs());

  const summary = summarizeMonth({
    ym: YM,
    reports: REPORTS,
    template: TEBAYA_TEMPLATE,
    settings: SETTINGS,
    advances: ADVANCES,
  });
  const cash = calcCashPosition({
    reports: REPORTS,
    payments: PAYMENTS,
    settings: SETTINGS,
    advances: ADVANCES,
  });
  const unpaid = calcUnpaid({
    reports: REPORTS,
    payments: PAYMENTS,
    settings: SETTINGS,
    currentYm: YM,
    advances: ADVANCES,
  });

  const byLabel = new Map(sheet.headline.map((h) => [h.label, h.yen]));
  assert.equal(byLabel.get("売上"), summary.sales);
  assert.equal(byLabel.get("経費の合計"), summary.expenseTotal);
  assert.equal(byLabel.get("今月の利益"), summary.profit);
  assert.equal(byLabel.get("今の現金"), cash.balance);
  assert.equal(byLabel.get("まだ払っていないお金"), unpaid.total);
  assert.equal(sheet.expenseTotal, summary.expenseTotal);
  assert.equal(sheet.reportCount, summary.reportCount);
});

test("売上は日報の売上を足した額と同じ（数え落ちが無い）", () => {
  const sheet = buildOneSheet(inputs());
  const byHand = REPORTS.reduce((s, r) => s + (r.sales_amount ?? 0), 0);
  const sales = sheet.headline.find((h) => h.label === "売上")?.yen;
  assert.equal(sales, byHand);
  assert.equal(sales, 183900);
});

// ------------------------------------------------------------------
// ② 月の経費は3か所で同じ（f1-2 を実データに近い形で固定する）
// ------------------------------------------------------------------

test("月の経費は 画面・科目ごとの内訳・会計ソフト向けCSV の3か所で同じ数字", () => {
  const sheet = buildOneSheet(inputs());
  const check = sheet.expenseCheck;

  assert.equal(check.screen, check.byAccount);
  assert.equal(check.screen, check.csv);
  assert.equal(check.same, true);

  // 別の道でもう一度数え直して、同じになることを確かめる
  const summary = summarizeMonth({
    ym: YM,
    reports: REPORTS,
    template: TEBAYA_TEMPLATE,
    settings: SETTINGS,
    advances: ADVANCES,
  });
  const merged = mergedExpenseByAccount(summary.expenseByAccount);
  const byAccount = DISPLAY_EXPENSE_ACCOUNTS.reduce(
    (sum, a) => sum + (merged[a.key] ?? 0),
    0,
  );
  const rows = buildJournalRows({
    ym: YM,
    reports: REPORTS,
    payments: PAYMENTS,
    template: TEBAYA_TEMPLATE,
    settings: SETTINGS,
    advances: ADVANCES,
  });
  assert.equal(byAccount, summary.expenseTotal);
  assert.equal(journalExpenseTotal(rows), summary.expenseTotal);
  assert.equal(sheet.journalRowCount, rows.length);
});

test("経費の合計は、出どころ（レジ・立替・人件費・家賃）を足した額と同じ", () => {
  const sheet = buildOneSheet(inputs());
  const sumBreakdown = sheet.expenseBreakdown.reduce((s, e) => s + e.yen, 0);
  assert.equal(sumBreakdown, sheet.expenseTotal);
});

test("種類が分からなかった経費は、黙って消さずに『要確認』に出る", () => {
  const sheet = buildOneSheet(inputs());
  assert.ok(
    sheet.unmatched.some((u) => u.description.includes("よく分からない支払い")),
    "振り分けられなかった行が要確認に出ていない",
  );
});

// ------------------------------------------------------------------
// ③ 見本と本物が同じ道を通る
// ------------------------------------------------------------------

test("見本（架空のお店）も同じ関数から作られている", () => {
  const sample = buildMonthlySample(new Date("2026-09-20T00:00:00Z"));
  // 形がそろっていること（本物の1枚と同じ部品で描けること）
  for (const key of [
    "monthLabel",
    "shopName",
    "headline",
    "expenses",
    "expenseTotal",
    "expenseCheck",
    "journalRows",
    "unmatched",
  ] as const) {
    assert.ok(key in sample, `見本に ${key} が無い`);
  }
  assert.equal(sample.expenseCheck.same, true);
});

test("見本と本物の1枚は、同じ見た目の部品を使っている", () => {
  const sampleSrc = readFileSync("app/keiri/monthly-sample/page.tsx", "utf8");
  const realSrc = readFileSync("app/keiri/monthly/page.tsx", "utf8");
  for (const src of [sampleSrc, realSrc]) {
    assert.ok(
      src.includes("OneSheetView"),
      "1枚の見た目が共通の部品を通っていない（2つに分かれると見本が嘘になる）",
    );
  }
});

// ------------------------------------------------------------------
// ④ 本物の1枚は合言葉の内側。架空のお店のデータを混ぜない
// ------------------------------------------------------------------

test("本物の1枚は合言葉の内側にあり、架空のお店のデータを読まない", () => {
  const src = readFileSync("app/keiri/monthly/page.tsx", "utf8");
  assert.ok(src.includes("AdminGate"), "合言葉の門が掛かっていない");
  assert.ok(!src.includes("/lib/keiri/demo"), "架空のお店のデータを読んでいる");
  assert.ok(!src.includes("buildMonthlySample"), "見本（架空のお店）を出している");
  // 金額を画面に直書きしていない（「12,345円」のような書き方が無いこと）
  assert.ok(
    !/[0-9]{1,3},[0-9]{3}円/.test(src),
    "1枚の画面に金額が直書きされている",
  );
});

test("申し込んだお店の名前は、分からないときは作らない（空にする）", () => {
  assert.equal(sheetShopName("tebaya"), "手羽屋");
  assert.equal(sheetShopName(null), "手羽屋");
  assert.equal(sheetShopName("t_11111111-2222-3333-4444-555555555555"), "");
});

// ------------------------------------------------------------------
// ⑤ 読むところは1か所。書き込みをしない
// ------------------------------------------------------------------

test("倉庫から読む手順は1か所で、経理画面も1枚の要約も同じ関数を通る", () => {
  const keiri = readFileSync("app/keiri/page.tsx", "utf8");
  const monthly = readFileSync("app/keiri/monthly/page.tsx", "utf8");
  assert.ok(keiri.includes("loadKeiriMonth"), "経理画面が共通の読み手を通っていない");
  assert.ok(monthly.includes("loadKeiriMonth"), "1枚の要約が共通の読み手を通っていない");
});

test("読む手順は倉庫に書き込まない（読むだけ）", () => {
  const src = readFileSync("lib/keiri/loadMonth.ts", "utf8");
  for (const forbidden of [".insert(", ".update(", ".upsert(", ".delete("]) {
    assert.ok(!src.includes(forbidden), `読むだけのはずが ${forbidden} を使っている`);
  }
});

test("金額の表示はマイナスも読める形で出る", () => {
  assert.equal(sheetYen(183900), "183,900円");
  assert.equal(sheetYen(-159854), "−159,854円");
});
