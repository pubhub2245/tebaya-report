/**
 * 「毎月お届けするもの」の見本（lib/keiri/monthlySample.ts）のテスト。
 *
 * ★ここで守るのは4点。どれも「見本が嘘をつかない」ための守りです。
 *   ① 見本の数字は **本物と同じ関数の答えと1円も違わない**
 *      （見本のために数字を書き写した瞬間に落ちる）
 *   ② 見本は **架空のお店**の数字だけを使う（実在の店名・出店先が混ざったら落ちる）
 *   ③ 紹介ページに **金額を直書きしていない**（直書きすると、計算を直しても見本だけ古くなる）
 *   ④ 仕訳の列と、会計ソフト（マネーフォワード）の列数が、本物の定義と一致している
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  SAMPLE_JOURNAL_PREVIEW_ROWS,
  SAMPLE_LEAD,
  SAMPLE_NOTICE,
  buildMonthlySample,
  sampleYen,
} from "../lib/keiri/monthlySample";
import {
  calcCashPosition,
  calcUnpaid,
  summarizeMonth,
} from "../lib/keiri/aggregate";
import {
  JOURNAL_HEADERS,
  buildJournalRows,
  journalExpenseTotal,
} from "../lib/keiri/journal";
import { MF_HEADERS, toMoneyForwardRows } from "../lib/keiri/moneyforward";
import { YAYOI_HEADERS, toYayoiRows } from "../lib/keiri/yayoi";
import {
  DEMO_SHOP_NAME,
  demoAdvances,
  demoPayments,
  demoReports,
  demoSettings,
} from "../lib/keiri/demo";
import { GENERIC_TEMPLATE } from "../lib/keiri/templates/generic";
import { previousMonthRange } from "../lib/keiri/caseStats";

/** 見本を作る日を固定する（前の月＝2026年8月になる日） */
const TODAY = new Date("2026-09-20T00:00:00Z");
const YM = "2026-08";

function realNumbers() {
  const settings = demoSettings(YM);
  const reports = demoReports(YM);
  const payments = demoPayments();
  // ★立替も渡す（月の経費は立替も含めた全部で1つ。2026-10-02・kp218）。
  //   見本の側だけ立替を数えていると、ここで1円ずれて落ちます。
  const advances = demoAdvances(YM);
  const template = GENERIC_TEMPLATE;
  return {
    summary: summarizeMonth({ ym: YM, reports, template, settings, advances }),
    cash: calcCashPosition({ reports, payments, settings, advances }),
    unpaid: calcUnpaid({ reports, payments, settings, currentYm: YM, advances }),
    rows: buildJournalRows({ ym: YM, reports, payments, template, settings, advances }),
  };
}

test("見本は前の月を指し、架空のお店の名前が入っている", () => {
  const s = buildMonthlySample(TODAY);
  assert.equal(s.monthLabel, "2026年8月");
  assert.equal(s.shopName, DEMO_SHOP_NAME);
  assert.ok(s.shopName.includes("架空"), "架空のお店だと分かる名前であること");
  assert.ok(SAMPLE_NOTICE.includes("架空"), "見本の断り書きに「架空」が入っていること");
  assert.ok(SAMPLE_LEAD.length > 0);
});

test("要約の5つの数字が、本物の関数の答えと1円も違わない", () => {
  const { summary, cash, unpaid } = realNumbers();
  const s = buildMonthlySample(TODAY);
  const by = (label: string) => s.headline.find((h) => h.label === label)?.yen;

  assert.equal(by("売上"), summary.sales);
  assert.equal(by("経費の合計"), summary.expenseTotal);
  assert.equal(by("今月の利益"), summary.profit);
  assert.equal(by("今の現金"), cash.balance);
  assert.equal(by("まだ払っていないお金"), unpaid.total);
  assert.equal(s.headline.length, 5);
});

test("経費の内訳は 0円の科目を出さず、合計は経費の合計と合う", () => {
  const { summary } = realNumbers();
  const s = buildMonthlySample(TODAY);
  assert.ok(s.expenses.length > 0, "内訳が空だと、何に使ったか分からない見本になる");
  for (const e of s.expenses) assert.ok(e.yen > 0, `0円の行が出ている: ${e.label}`);
  const total = s.expenses.reduce((t, e) => t + e.yen, 0);
  assert.equal(total, summary.expenseTotal);
});

test("仕訳の見本は本物の仕訳の先頭そのままで、列と行数を偽らない", () => {
  const { rows } = realNumbers();
  const s = buildMonthlySample(TODAY);

  assert.deepEqual([...s.journalHeaders], [...JOURNAL_HEADERS]);
  assert.equal(s.journalRowCount, rows.length);
  assert.equal(s.journalRows.length, Math.min(SAMPLE_JOURNAL_PREVIEW_ROWS, rows.length));
  s.journalRows.forEach((r, i) => {
    assert.equal(r.date, rows[i].date);
    assert.equal(r.debitAccount, rows[i].debitAccount);
    assert.equal(r.debitAmount, rows[i].debitAmount);
    assert.equal(r.creditAccount, rows[i].creditAccount);
    assert.equal(r.creditAmount, rows[i].creditAmount);
    assert.equal(r.note, rows[i].note);
  });
});

test("会計ソフトの列数は、実際に書き出すCSVの列数と同じ", () => {
  const { rows } = realNumbers();
  const s = buildMonthlySample(TODAY);
  assert.equal(s.mfColumnCount, MF_HEADERS.length);
  const mf = toMoneyForwardRows(rows);
  assert.ok(mf.length > 0, "書き出す行が1行も無い");
  for (const line of mf) assert.equal(line.length, s.mfColumnCount);

  // ★紹介ページで「弥生は25列でお出しします」と名指しで書いているので、
  //   実際に書き出す列の数とズレたらここで落とす（嘘の案内を出さないため）。
  assert.equal(s.yayoiColumnCount, YAYOI_HEADERS.length);
  const yayoi = toYayoiRows(rows);
  assert.ok(yayoi.length > 0, "書き出す行が1行も無い");
  for (const line of yayoi) assert.equal(line.length, s.yayoiColumnCount);
});

test("見本に実在のお店・出店先の名前が混ざっていない", () => {
  const s = buildMonthlySample(TODAY);
  const text = JSON.stringify(s);
  // 手羽屋の実データにだけ出てくる言葉。1つでも入っていたら架空の店ではない
  for (const word of ["手羽屋", "もも屋", "ながやま", "PASIO", "イデ", "なぎさ"]) {
    assert.ok(!text.includes(word), `見本に実在の名前が入っている: ${word}`);
  }
});

test("紹介ページに、見本の金額を直書きしていない", () => {
  const raw = readFileSync(new URL("../app/keiri/case/page.tsx", import.meta.url), "utf8");
  // 説明の書き置き（/* … */ と // …）は画面に出ないので、数字を探す前に外す。
  // ここを外さないと「月15,000円」という説明文が「5,000」に引っかかってしまう。
  const page = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const s = buildMonthlySample(TODAY);
  const amounts = [
    ...s.headline.map((h) => h.yen),
    ...s.expenses.map((e) => e.yen),
    ...s.journalRows.map((r) => r.debitAmount),
  ].filter((n) => n !== 0);

  for (const n of amounts) {
    const abs = Math.abs(Math.round(n));
    for (const form of [String(abs), abs.toLocaleString("ja-JP")]) {
      // 前後が数字・カンマでないときだけ「その金額そのもの」とみなす
      const re = new RegExp(`(?<![\\d,])${form.replace(/,/g, ",")}(?![\\d,])`);
      assert.ok(!re.test(page), `画面に金額が直書きされている: ${form}`);
    }
  }
  // 文言も lib から引いていること（画面に書き写さない）
  assert.ok(page.includes("SAMPLE_NOTICE"));
  assert.ok(page.includes("SAMPLE_LEAD"));
  assert.ok(page.includes("buildMonthlySample"));
  assert.ok(!page.includes(SAMPLE_NOTICE), "断り書きの文が画面に直書きされている");
});

test("金額の表示は3桁区切りで、マイナスが分かる", () => {
  assert.equal(sampleYen(82000), "82,000円");
  assert.equal(sampleYen(0), "0円");
  assert.equal(sampleYen(-1200), "−1,200円");
});

// ------------------------------------------------------------------
// 月の経費が3か所で同じか（f1-2・2026-10-03）
// ------------------------------------------------------------------

test("月の経費は、画面・科目ごとの内訳・会計ソフト向けCSV の3通りで同じ数字になる", () => {
  const s = buildMonthlySample(TODAY);
  assert.ok(s.expenseTotal > 0, "見本の経費が0円では確かめにならない");
  assert.equal(s.expenseCheck.screen, s.expenseTotal);
  assert.equal(s.expenseCheck.byAccount, s.expenseTotal);
  assert.equal(s.expenseCheck.csv, s.expenseTotal);
  assert.equal(s.expenseCheck.same, true);
});

test("CSVの経費側の合計は、本物の月次の経費合計と1円も違わない", () => {
  const { start } = previousMonthRange(TODAY);
  const ym = start.slice(0, 7);
  const settings = demoSettings(ym);
  const reports = demoReports(ym);
  const payments = demoPayments();
  const advances = demoAdvances(ym);

  const summary = summarizeMonth({
    ym,
    reports,
    template: GENERIC_TEMPLATE,
    settings,
    advances,
  });
  const rows = buildJournalRows({
    ym,
    reports,
    payments,
    template: GENERIC_TEMPLATE,
    settings,
    advances,
  });

  assert.equal(journalExpenseTotal(rows), summary.expenseTotal);
});

test("CSVの経費合計は、売上と支払い（未払金の消し込み）を数えない", () => {
  // 現金／売上高・未払金／現金 の2行だけなら、経費は0円
  const rows = [
    { date: "2026-08-01", debitAccount: "現金", debitAmount: 10000, creditAccount: "売上高", creditAmount: 10000, note: "売上" },
    { date: "2026-08-25", debitAccount: "未払金", debitAmount: 8000, creditAccount: "現金", creditAmount: 8000, note: "日当の支払い" },
  ];
  assert.equal(journalExpenseTotal(rows), 0);

  // 経費の発生は、相手が現金でも未払金でも数える
  const rows2 = [
    ...rows,
    { date: "2026-08-02", debitAccount: "仕入（材料）", debitAmount: 3000, creditAccount: "現金", creditAmount: 3000, note: "肉" },
    { date: "2026-08-03", debitAccount: "人件費", debitAmount: 8000, creditAccount: "未払金", creditAmount: 8000, note: "日当" },
  ];
  assert.equal(journalExpenseTotal(rows2), 11000);
});

test("1枚だけのページ（/keiri/monthly-sample）に、見本の金額を直書きしていない", () => {
  const raw = readFileSync(
    new URL("../app/keiri/monthly-sample/page.tsx", import.meta.url),
    "utf8",
  );
  const page = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const s = buildMonthlySample(TODAY);
  const amounts = [
    ...s.headline.map((h) => h.yen),
    ...s.expenses.map((e) => e.yen),
    ...s.expenseBreakdown.map((e) => e.yen),
    ...s.journalRows.map((r) => r.debitAmount),
    s.expenseTotal,
  ].filter((n) => n !== 0);

  for (const n of amounts) {
    const abs = Math.abs(Math.round(n));
    for (const form of [String(abs), abs.toLocaleString("ja-JP")]) {
      const re = new RegExp(`(?<![\\d,])${form.replace(/,/g, ",")}(?![\\d,])`);
      assert.ok(!re.test(page), `画面に金額が直書きされている: ${form}`);
    }
  }
  // 文言も lib から引いていること
  assert.ok(page.includes("SAMPLE_NOTICE"));
  assert.ok(page.includes("SAMPLE_LEAD"));
  assert.ok(page.includes("buildMonthlySample"));
  assert.ok(!page.includes(SAMPLE_NOTICE), "断り書きの文が画面に直書きされている");
  // 値段は /keiri/case が唯一の正。この1枚に金額の約束を書かない
  assert.ok(!page.includes("15,000"), "この1枚に値段を書いている");
});

test("要確認（雑費に入れた経費）は、見本でも隠さずに出す", () => {
  const s = buildMonthlySample(TODAY);
  assert.ok(s.unmatched.length >= 1, "見本に、種類が分からない経費が1件は入っていること");
  for (const u of s.unmatched) {
    assert.ok(u.description.length > 0);
    assert.ok(u.amount > 0);
  }
});
