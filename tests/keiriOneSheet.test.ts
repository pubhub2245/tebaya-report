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

import {
  ONE_SHEET_DISCLAIMER,
  buildOneSheet,
  sheetYen,
} from "../lib/keiri/oneSheet";
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
  assert.equal(byLabel.get("かかったお金"), summary.expenseTotal);
  assert.equal(byLabel.get("残ったお金（利益）"), summary.profit);
  assert.equal(sheet.cash.balance, cash.balance);
  assert.equal(sheet.cash.countedOn, cash.openingDate);
  assert.equal(sheet.cash.countedYen, cash.openingBalance);
  assert.equal(sheet.unpaid.total, unpaid.total);
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
  assert.equal(sheetYen(-159854), "−159,854円（赤字）");
});

// ------------------------------------------------------------------
// ⑥ 言葉と並び順（2026-10-04・kp231 ②・meta/keiri-material-onepage-real）
//    店主が読む1枚なので、会計の言葉を出さない。並び順も決めたとおりにする。
// ------------------------------------------------------------------

test("大きな数字は『売上・かかったお金・残ったお金（利益）』の3つ、この順", () => {
  const sheet = buildOneSheet(inputs());
  assert.deepEqual(
    sheet.headline.map((h) => h.label),
    ["売上", "かかったお金", "残ったお金（利益）"],
  );
});

test("『売上 − かかったお金 ＝ 残ったお金』の1行は計算から作る（手で打たない）", () => {
  const sheet = buildOneSheet(inputs());
  const [sales, expense, profit] = sheet.headline.map((h) => h.yen);
  assert.equal(sales - expense, profit);
  for (const yen of [sales, expense, profit]) {
    assert.ok(
      sheet.profitLine.includes(Math.abs(yen).toLocaleString("ja-JP")),
      `式の1行に ${yen} が入っていない`,
    );
  }
});

test("見出しと『いつ作ったか』が1枚に入る（日報の件数も書く）", () => {
  const sheet = buildOneSheet({ ...inputs(), madeOn: "2026-10-04" });
  assert.equal(sheet.title, "手羽屋　2026年9月のまとめ");
  assert.equal(sheet.madeOnLabel, "10月4日に作りました・日報3件から");
});

test("かかったお金の中身は金額の大きい順で、合計は『かかったお金』と同じ", () => {
  const sheet = buildOneSheet(inputs());
  const yens = sheet.expenses.map((e) => e.yen);
  assert.deepEqual(yens, [...yens].sort((a, b) => b - a), "大きい順になっていない");
  assert.equal(
    yens.reduce((s, y) => s + y, 0),
    sheet.expenseTotal,
  );
});

test("まだ払っていないお金は、相手ごとの内訳の合計が見出しと合う", () => {
  const sheet = buildOneSheet(inputs());
  assert.equal(
    sheet.unpaid.lines.reduce((s, l) => s + l.yen, 0),
    sheet.unpaid.total,
  );
  assert.equal(sheet.verify.unpaidOk, true);
});

test("いま手元にある現金は『いつ数えた いくら』から計算したと書く", () => {
  const sheet = buildOneSheet(inputs());
  assert.equal(sheet.cash.countedOn, SETTINGS.opening_date);
  assert.equal(sheet.cash.countedYen, SETTINGS.opening_balance);
});

test("検算が3つとも合っていれば出す。合っていなければ1枚を出さない作りになっている", () => {
  const sheet = buildOneSheet(inputs());
  assert.equal(sheet.verify.ok, true);
  assert.deepEqual(sheet.verify.problems, []);
  // 画面の側も「合わなければ出さない」で分かれていること
  const view = readFileSync("app/keiri/components/OneSheetView.tsx", "utf8");
  assert.ok(
    view.includes("sheet.verify.ok"),
    "検算が合わない月でも1枚を出してしまう作りになっている",
  );
});

test("いちばん下の断り書きは lib の1か所から出す（税務の判断はしない）", () => {
  const view = readFileSync("app/keiri/components/OneSheetView.tsx", "utf8");
  assert.ok(view.includes("ONE_SHEET_DISCLAIMER"));
  assert.ok(ONE_SHEET_DISCLAIMER.includes("税理士"));
  assert.ok(!view.includes(ONE_SHEET_DISCLAIMER), "断り書きが画面に直書きされている");
});

// ------------------------------------------------------------------
// ⑦ 確かめてほしいこと（隠さない・勝手に直さない）
// ------------------------------------------------------------------

test("同じ支払いが2か所にある疑いは、件数と『片方を消すとどうなるか』まで出す", () => {
  const reports: KeiriReport[] = [
    {
      date: "2026-09-12",
      sales_amount: 100000,
      labor: 0,
      expenses: [{ description: "ハピネス都城 キャノーラ油", amount: 11448 }],
    },
  ];
  const advances: KeiriAdvance[] = [
    { date: "2026-09-11", amount: 11448, description: "キャノーラ油（ハピネス都城）", payer: "じゅん" },
  ];
  const sheet = buildOneSheet({
    ...inputs(),
    reports,
    advances,
    payments: [],
  });
  const dup = sheet.review.duplicate;
  assert.ok(dup, "疑いが出ていない");
  assert.equal(dup!.count, 1);
  assert.equal(dup!.sameMonthYen, 11448);
  assert.equal(dup!.expenseAfter, sheet.expenseTotal - 11448);
  assert.equal(dup!.profitAfter, sheet.headline[2].yen + 11448);
  assert.equal(sheet.review.any, true);
});

test("疑いが無い月は、確かめてほしいことに疑いを出さない", () => {
  const sheet = buildOneSheet({ ...inputs(), advances: [] });
  assert.equal(sheet.review.duplicate, null);
});

test("レシートの写真の有無が読めないデータは『0件』と書かない（null にする）", () => {
  // 倉庫の軽い見え方（keiri_reports）は写真の欄そのものを抜いている
  const sheet = buildOneSheet(inputs());
  assert.equal(sheet.review.noReceiptCount, null);

  // 欄がある（写真が無い）データなら、件数を出す
  const withField: KeiriReport[] = [
    {
      date: "2026-09-03",
      sales_amount: 10000,
      labor: 0,
      expenses: [
        { description: "鶏もも 仕入", amount: 1000, receipt_image_url: null },
        { description: "油", amount: 500, receipt_image_url: "https://example.test/a.jpg" },
      ],
    },
  ];
  const sheet2 = buildOneSheet({ ...inputs(), reports: withField, advances: [] });
  assert.equal(sheet2.review.noReceiptCount, 1);
});
