/**
 * 仕訳（しわけ）CSVの組み立て。共通部分。
 *
 * 「仕訳」＝ 会計ソフトが読む1行の記録。
 * 「8月1日／現金 12,000円／売上高 12,000円」のような形のこと。
 *
 * ★形は docs/keiri.md 6章で決めています。列を勝手に増やさないでください。
 *
 * ■ 「未払金（みばらいきん）」について
 *   給与と外注費は「発生した日」と「払った日」がズレるので、
 *   会計ソフトが読めるようにするには、いったん「未払金」という箱を通します。
 *     発生したとき： 人件費 ／ 未払金
 *     払ったとき　： 未払金 ／ 現金
 *   これは**CSVの中だけ**の話です。アプリの中に未払金の帳簿は作りません。
 *   画面にも「未払金」という言葉は出しません（「まだ払っていないお金」と書きます）。
 */

import { accountLabel } from "./accounts";
import { calcOutsourcing, inMonth, monthEnd } from "./aggregate";
import { amountOf, classifyExpense, expenseItemsOf } from "./classify";
import type {
  BusinessTemplate,
  KeiriPayment,
  KeiriReport,
  KeiriSettings,
} from "./types";

/** CSVで使う相手勘定の名前 */
const CASH = "現金";
const ACCRUED = "未払金";

export type JournalRow = {
  date: string;
  debitAccount: string;
  debitAmount: number;
  creditAccount: string;
  creditAmount: number;
  note: string;
};

/** CSVの列の見出し */
export const JOURNAL_HEADERS = [
  "日付",
  "借方科目",
  "借方金額",
  "貸方科目",
  "貸方金額",
  "摘要",
] as const;

/**
 * その月の仕訳を組み立てる。
 *
 * - 売上　　　： 現金 ／ 売上高
 * - 経費　　　： （科目） ／ 現金
 * - 人件費発生： 人件費 ／ 未払金（日報の日付）
 * - 外注費発生： 外注費（Alpha） ／ 未払金（その月の末日に1行だけ）
 * - 支払い　　： 未払金 ／ 現金（支払日）
 */
export function buildJournalRows(params: {
  ym: string;
  reports: KeiriReport[];
  payments: KeiriPayment[];
  template: BusinessTemplate;
  settings: KeiriSettings;
}): JournalRow[] {
  const { ym, reports, payments, template, settings } = params;
  const rows: JournalRow[] = [];

  const target = reports
    .filter((r) => inMonth(r.date, ym))
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let salesTotal = 0;

  for (const r of target) {
    const place = (r.location || "").trim();

    // 売上
    const sales = Number(r.sales_amount) || 0;
    salesTotal += sales;
    if (sales !== 0) {
      rows.push({
        date: r.date,
        debitAccount: CASH,
        debitAmount: sales,
        creditAccount: accountLabel("sales"),
        creditAmount: sales,
        note: place ? `売上 ${place}` : "売上",
      });
    }

    // 経費（レジから払ったもの）
    for (const item of expenseItemsOf(r.expenses)) {
      const amount = amountOf(item);
      if (amount === 0) continue;
      const { account } = classifyExpense(item.description, template);
      rows.push({
        date: r.date,
        debitAccount: accountLabel(account),
        debitAmount: amount,
        creditAccount: CASH,
        creditAmount: amount,
        note: (item.description || "").trim() || "経費",
      });
    }

    // 人件費の発生（その日の日当）
    const labor = Number(r.labor) || 0;
    if (labor !== 0) {
      const who = (r.staff_name || "").trim();
      const parts = [place, who].filter(Boolean).join("・");
      rows.push({
        date: r.date,
        debitAccount: accountLabel("payroll"),
        debitAmount: labor,
        creditAccount: ACCRUED,
        creditAmount: labor,
        note: parts ? `日当 ${parts}` : "日当",
      });
    }
  }

  // 外注費の発生（その月の末日に1行だけ）
  const outsourcing = calcOutsourcing(salesTotal, settings.outsourcing_rate);
  if (outsourcing !== 0) {
    const pct = Math.round((Number(settings.outsourcing_rate) || 0) * 1000) / 10;
    rows.push({
      date: monthEnd(ym),
      debitAccount: accountLabel("outsourcing"),
      debitAmount: outsourcing,
      creditAccount: ACCRUED,
      creditAmount: outsourcing,
      note: `Alpha 業務委託料（売上高の${pct}%）`,
    });
  }

  // 支払い（その月に払ったもの）
  const paid = payments
    .filter((p) => inMonth(p.paid_on, ym))
    .slice()
    .sort((a, b) => (a.paid_on < b.paid_on ? -1 : a.paid_on > b.paid_on ? 1 : 0));
  for (const p of paid) {
    const amount = Number(p.amount) || 0;
    if (amount === 0) continue;
    const base = p.kind === "payroll" ? "給与の支払い" : "Alphaへの支払い";
    const memo = (p.memo || "").trim();
    rows.push({
      date: p.paid_on,
      debitAccount: ACCRUED,
      debitAmount: amount,
      creditAccount: CASH,
      creditAmount: amount,
      note: memo ? `${base}（${memo}）` : base,
    });
  }

  return rows;
}

/** CSVの1マスぶんを、カンマや改行が入っていても壊れない形にする */
function csvCell(value: string | number): string {
  const s = String(value ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * 仕訳をCSVの文字列にする。
 *
 * ★先頭に BOM（ビーオーエム）という目印を付けます。
 *   これが無いと、Excelで開いたときに日本語が文字化けします。
 */
export function toCsv(rows: JournalRow[]): string {
  const lines: string[] = [];
  lines.push(JOURNAL_HEADERS.join(","));
  for (const r of rows) {
    lines.push(
      [
        r.date,
        csvCell(r.debitAccount),
        r.debitAmount,
        csvCell(r.creditAccount),
        r.creditAmount,
        csvCell(r.note),
      ].join(","),
    );
  }
  const BOM = "\uFEFF"; // Excel用の目印（これが無いと日本語が文字化けする）
  return BOM + lines.join("\r\n") + "\r\n";
}
