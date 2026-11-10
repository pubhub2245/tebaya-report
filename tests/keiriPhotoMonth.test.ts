/**
 * 写真日報（2026-11-07 じゅん決定・/report/photo）で保存される形のまま、
 * 月の締めが今までどおり正しく出るかを固定する（f1-2・f1-3・f1-7）。
 *
 * ■ なぜ要るのか（2026-11-10・B）
 *   仕上げチェック表の ①経理の中身 は、**9月の手入力の日報**で合格にしました。
 *   ところが 11/7 の決定で、手羽屋の日報は **写真だけ**（/report/photo）に変わり、
 *   保存される1行の形が増えています：
 *     ・人件費（labor）… 最後の確認で入れた日だけ入る（それまでは日当の欄だった）
 *     ・場代の行 … マスタの決まりから自動で入る。人が直したら印（booth_fee_edited）が付く
 *     ・最後の確認で手入力した経費 … レシートが無いので理由（no_receipt_reason）が入る
 *     ・レシートから作った行 … 1枚のレシートから出た行 全部に同じ写真が付く（→ 4-12）
 *   ＝ **月の締めは、この新しい形でも同じように合わなければいけません。**
 *   11月の本番データでは実測で合っていますが（/api/keiri/selfcheck?ym=2026-11）、
 *   実データは毎月変わるので、**形を試験で固定**しておきます。
 *
 * ■ ここで守るもの（どれも「黙ってずれない」ための守り）
 *   ① 経費の数え方が 画面・科目ごと・会計ソフト向けCSV の3か所で同じ（f1-2）
 *   ② 売上 − かかったお金 ＝ 残ったお金（f1-2）
 *   ③ 試算表の左右が合い、画面と1円も違わない（f1-7）
 *   ④ 人件費（labor）が **1回だけ** 数えられる（二重に入らない）
 *   ⑤ 場代の行は「出店料」に入る（雑費に落ちない）。手入力の行は「要確認」で残る（f1-3）
 *   ⑥ レシートが無い行の数が数えられる（分からないまま 0 と言わない）
 *
 * ★金額は1円も直しません。倉庫も1行も読み書きしません（計算だけの試験）。
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  NO_ADJUSTMENTS,
  applyAdjustments,
  boothFeeExpense,
  buildDailyReportRow,
  receiptToExpenses,
  type PhotoExpense,
  type PhotoReportDraft,
} from "../lib/photoReport";
import { BOOTH_FEE_LABEL, sumExpenses } from "../lib/money";
import type { SaleProduct } from "../lib/salesBreakdown";
import { buildOneSheet } from "../lib/keiri/oneSheet";
import {
  calcCashPosition,
  mergedExpenseByAccount,
  summarizeMonth,
} from "../lib/keiri/aggregate";
import { DISPLAY_EXPENSE_ACCOUNTS } from "../lib/keiri/accounts";
import { buildJournalRows, journalExpenseTotal } from "../lib/keiri/journal";
import { buildTrialBalance, checkTrialBalance } from "../lib/keiri/trialBalance";
import { TEBAYA_TEMPLATE } from "../lib/keiri/templates/tebaya";
import type { KeiriReport, KeiriSettings } from "../lib/keiri/types";

const YM = "2026-11";

/** 商品マスタ（架空の数字。単価は写真日報の内訳の検算に使うだけ） */
const PRODUCTS: SaleProduct[] = [
  { id: 1, shop: "手羽屋", name: "手羽先", price: 200, kind: "primary", is_active: true, sort_order: 1 },
  { id: 2, shop: "手羽屋", name: "手羽餃子", price: 300, kind: "normal", is_active: true, sort_order: 2 },
];

const SETTINGS: KeiriSettings = {
  opening_date: "2026-11-01",
  opening_balance: 50000,
  outsourcing_rate: 0.1,
  monthly_rent: 0,
  rent_start_month: "2026-11",
};

/** 写真日報の下書き（売上の読み取りはここでは試さないので、内訳は合っている形にする） */
function draftWith(sales: number, expenses: PhotoExpense[]): PhotoReportDraft {
  return {
    sales,
    counts: { 手羽先: 0, 手羽餃子: 0 },
    unmatched: [],
    breakdown: { lines: [], total: sales, diff: 0, matched: true },
    expenses,
    expensesTotal: sumExpenses(expenses),
    salesMissing: false,
    mismatch: null,
  } as unknown as PhotoReportDraft;
}

/**
 * 写真日報が実際に保存する1行を、**本物の関数**で作る。
 * （形を手で写すと、アプリ側が変わったときに試験だけ古いまま通ってしまう）
 */
function photoRow(p: {
  date: string;
  location: string;
  sales: number;
  receipts: { items: { name: string; amount: number }[]; photo: string }[];
  boothRule: Parameters<typeof boothFeeExpense>[0];
  extras: { description: string; amount: number }[];
  labor: number;
}): KeiriReport {
  const fromReceipts = p.receipts.flatMap((r) =>
    receiptToExpenses({ items: r.items, amount: sumOf(r.items) }, r.photo),
  );
  const booth = boothFeeExpense(p.boothRule, p.sales);
  const base = draftWith(p.sales, [...fromReceipts, ...(booth ? [booth] : [])]);
  const adjusted = applyAdjustments(base, {
    ...NO_ADJUSTMENTS,
    extras: p.extras,
    labor: p.labor,
  });
  const row = buildDailyReportRow({
    date: p.date,
    location: p.location,
    staffName: "ゆうや",
    draft: adjusted,
    products: PRODUCTS,
    cumulativeBefore: 0,
    expensesForSave: adjusted.expenses,
    lineText: "",
    cleanupInventory: null,
    cleanupTasks: null,
  });
  // 経理が読むのは daily_reports の行そのもの（必要な欄だけ取り出す）
  return {
    date: row.date,
    location: row.location,
    staff_name: row.staff_name,
    shop: row.shop,
    sales_amount: row.sales_amount,
    labor: row.labor,
    expenses: row.expenses,
  } as KeiriReport;
}

const sumOf = (items: { amount: number }[]) =>
  items.reduce((s, i) => s + (Number(i.amount) || 0), 0);

/** 写真日報らしい11月（レシート2枚・場代・手入力・人件費が入った日を含む3日ぶん） */
const REPORTS: KeiriReport[] = [
  photoRow({
    date: "2026-11-03",
    location: "ながやま三股",
    sales: 62300,
    receipts: [
      { items: [{ name: "鶏もも 仕入", amount: 18400 }, { name: "レジ袋", amount: 540 }], photo: "https://example.invalid/a.jpg" },
    ],
    boothRule: { type: "percent", rate: 10 },
    extras: [],
    labor: 0,
  }),
  photoRow({
    date: "2026-11-05",
    location: "PASIO高城",
    sales: 48100,
    receipts: [
      { items: [{ name: "片栗粉・油", amount: 7300 }], photo: "https://example.invalid/b.jpg" },
    ],
    boothRule: { type: "fixed", amount: 2200 },
    // 研修の人が入った日：人件費と、レシートの出ない手入力の経費
    extras: [
      { description: "研修の人の交通費", amount: 1200 },
      { description: "よく分からない支払い", amount: 900 },
    ],
    labor: 8000,
  }),
  photoRow({
    date: "2026-11-07",
    location: "マンガ倉庫",
    sales: 73500,
    receipts: [
      { items: [{ name: "鶏手羽 仕入", amount: 22100 }], photo: "https://example.invalid/c.jpg" },
    ],
    // マンガ倉庫は場代そのものが無い（→ CLAUDE.md 4-15）＝行を作らない
    boothRule: { type: "none" },
    extras: [],
    labor: 0,
  }),
];

function inputs() {
  return {
    ym: YM,
    monthLabel: "2026年11月",
    shopName: "手羽屋",
    reports: REPORTS,
    payments: [],
    advances: [],
    settings: SETTINGS,
    template: TEBAYA_TEMPLATE,
    currentYm: YM,
  };
}

function summary() {
  return summarizeMonth({
    ym: YM,
    reports: REPORTS,
    template: TEBAYA_TEMPLATE,
    settings: SETTINGS,
    advances: [],
  });
}

// ------------------------------------------------------------------
// 形そのもの（写真日報が保存する1行）
// ------------------------------------------------------------------

test("写真日報の行には、経理が読む欄がそろっている", () => {
  for (const r of REPORTS) {
    assert.match(r.date, /^2026-11-\d\d$/);
    assert.equal(r.shop, "手羽屋");
    assert.ok((r.sales_amount ?? 0) > 0, "売上が入っていません");
    assert.ok(Array.isArray(r.expenses), "経費が配列ではありません");
  }
  // 場代の決まりが無い日（マンガ倉庫）は、0円の行を作らない（→ 4-15）
  const manga = REPORTS[2].expenses as { description: string }[];
  assert.ok(
    !manga.some((e) => e.description === BOOTH_FEE_LABEL),
    "決まりが無いのに場代の行が作られています",
  );
  // レシートから作った行には、どれも同じ写真が付いている（→ 4-12）
  const first = REPORTS[0].expenses as { description: string; receipt_image_url: string | null }[];
  const withPhoto = first.filter((e) => e.receipt_image_url);
  assert.equal(withPhoto.length, 2, "1枚のレシートから出た行 全部に写真が付いていません");
  assert.equal(new Set(withPhoto.map((e) => e.receipt_image_url)).size, 1);
});

// ------------------------------------------------------------------
// ① ② 経費の3か所一致と、売上 − 経費 ＝ 利益
// ------------------------------------------------------------------

test("月の経費は 画面・科目ごと・会計ソフト向けCSV の3か所で同じ", () => {
  const sheet = buildOneSheet(inputs());
  assert.equal(sheet.expenseCheck.same, true, sheet.verify.problems.join(" / "));
  assert.equal(sheet.expenseCheck.screen, sheet.expenseCheck.byAccount);
  assert.equal(sheet.expenseCheck.screen, sheet.expenseCheck.csv);

  const s = summary();
  const merged = mergedExpenseByAccount(s.expenseByAccount);
  const byAccount = DISPLAY_EXPENSE_ACCOUNTS.reduce((sum, a) => sum + (merged[a.key] ?? 0), 0);
  const rows = buildJournalRows({
    ym: YM,
    reports: REPORTS,
    payments: [],
    template: TEBAYA_TEMPLATE,
    settings: SETTINGS,
    advances: [],
  });
  assert.equal(byAccount, s.expenseTotal);
  assert.equal(journalExpenseTotal(rows), s.expenseTotal);
});

test("売上 − かかったお金 ＝ 残ったお金（写真日報でも検算が通る）", () => {
  const s = summary();
  assert.equal(s.sales, 62300 + 48100 + 73500);
  assert.equal(s.profit, s.sales - s.expenseTotal);
  const sheet = buildOneSheet(inputs());
  assert.deepEqual(sheet.verify.problems, [], "1枚の要約が検算で止まっています");
  assert.equal(sheet.verify.ok, true);
  assert.equal(sheet.verify.profitOk, true);
});

// ------------------------------------------------------------------
// ③ 試算表（f1-7）
// ------------------------------------------------------------------

test("試算表の左右が合い、画面の数字と1円も違わない", () => {
  const rows = buildJournalRows({
    ym: YM,
    reports: REPORTS,
    payments: [],
    template: TEBAYA_TEMPLATE,
    settings: SETTINGS,
    advances: [],
  });
  const trial = buildTrialBalance(rows);
  assert.equal(trial.balanced, true, "試算表の左右が合っていません");

  const s = summary();
  const check = checkTrialBalance({
    trial,
    sales: s.sales,
    expenseTotal: s.expenseTotal,
    profit: s.profit,
  });
  assert.deepEqual(check.problems, [], check.problems.join(" / "));
  assert.equal(check.ok, true);
  assert.equal(check.salesSame, true);
  assert.equal(check.expenseSame, true);
  assert.equal(check.profitSame, true);
  // 1枚の要約の側からも同じ答えが出る（画面と会計ソフト向けが別々に動かない）
  assert.equal(buildOneSheet(inputs()).verify.trialOk, true);
});

// ------------------------------------------------------------------
// ④ 人件費は1回だけ
// ------------------------------------------------------------------

test("最後の確認で入れた人件費は、1回だけ数えられる", () => {
  const s = summary();
  assert.equal(s.payroll, 8000, "人件費が1回だけ数えられていません");
  assert.equal(s.expenseByAccount.payroll, 8000);
  // 経費の明細（レジから払った分）には人件費を混ぜない＝二重計上にならない
  const fromRegister = REPORTS.reduce(
    (t, r) => t + sumExpenses((r.expenses ?? []) as { amount: number }[]),
    0,
  );
  assert.equal(s.expenseFromRegister, fromRegister);
  assert.equal(
    s.expenseTotal,
    fromRegister + s.payroll + s.outsourcing + s.rent,
    "経費の合計が『レジから＋人件費＋本部へ＋家賃』と合いません",
  );
});

// ------------------------------------------------------------------
// ⑤ ⑥ 科目の付き方と、レシートが無い行
// ------------------------------------------------------------------

test("場代は出店料に入り、手入力の経費は『要確認』で残る", () => {
  const s = summary();
  // 場代：売上の10%（62,300 → 6,230・1円未満切り捨て）＋ 定額 2,200
  assert.equal(s.expenseByAccount.booth_fee, 6230 + 2200);
  // 手入力の「研修の人の交通費」は対応表に無いので、黙って雑費にせず要確認に出す
  // 対応表に当たる手入力（交通費）は科目が付き、当たらない手入力は要確認に残る
  const unmatched = s.unmatched.map((u) => u.description);
  assert.deepEqual(unmatched, ["よく分からない支払い"], `要確認の中身が違います：${unmatched.join(" / ")}`);
});

test("レシートが無い行の数が数えられる（分からないまま 0 と言わない）", () => {
  const sheet = buildOneSheet(inputs());
  // 場代2行（レシートの出ない支払い → 4-15）＋ 最後の確認で手入力した2行 ＝ 4行
  assert.equal(sheet.review.noReceiptCount, 4);
});

// ------------------------------------------------------------------
// 現金（写真日報の行でも今の残高が出る・f3-3）
// ------------------------------------------------------------------

test("写真日報の行だけでも、今の現金残高が出る", () => {
  const cash = calcCashPosition({
    reports: REPORTS,
    payments: [],
    settings: SETTINGS,
    advances: [],
  });
  const s = summary();
  assert.equal(cash.openingBalance, 50000);
  // 金庫に入るお金＝売上、出るお金＝レジから払った経費（人件費と本部へ払う分は月末の精算）
  assert.equal(cash.balance, 50000 + s.sales - s.expenseFromRegister);
});
