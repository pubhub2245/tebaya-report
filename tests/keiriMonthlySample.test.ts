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
import { JOURNAL_HEADERS, buildJournalRows } from "../lib/keiri/journal";
import { MF_HEADERS, toMoneyForwardRows } from "../lib/keiri/moneyforward";
import { DEMO_SHOP_NAME, demoPayments, demoReports, demoSettings } from "../lib/keiri/demo";
import { GENERIC_TEMPLATE } from "../lib/keiri/templates/generic";

/** 見本を作る日を固定する（前の月＝2026年8月になる日） */
const TODAY = new Date("2026-09-20T00:00:00Z");
const YM = "2026-08";

function realNumbers() {
  const settings = demoSettings(YM);
  const reports = demoReports(YM);
  const payments = demoPayments();
  const template = GENERIC_TEMPLATE;
  return {
    summary: summarizeMonth({ ym: YM, reports, template, settings }),
    cash: calcCashPosition({ reports, payments, settings }),
    unpaid: calcUnpaid({ reports, payments, settings, currentYm: YM }),
    rows: buildJournalRows({ ym: YM, reports, payments, template, settings }),
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
