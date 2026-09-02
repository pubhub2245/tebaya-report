/**
 * 経理の集計。共通部分（業態が変わっても同じ）。
 *
 * ★定義は docs/keiri.md 5章にあります。ここを直すときは、先にあの文書を直してください。
 *
 * ■ 一番大事なところ（壊さないこと）
 *   給与・外注費（Alpha）・家賃（事務所）は「発生した日」と「実際に払った日」がズレます。
 *     ・利益     … **発生した分**を引く（その月の日当／売上の10%／その月の家賃）
 *     ・現金残高 … **実際に払った分だけ**を引く（まだ払っていない分は手元に残っている）
 *   この区別を壊すと、「今の現金」が実際の手元のお金と合わなくなります。
 */

import { canonicalLocationName } from "../locationName";
import {
  DISPLAY_EXPENSE_ACCOUNTS,
  EXPENSE_ACCOUNTS,
  type AccountKey,
  type ExpenseAccountKey,
} from "./accounts";
import { amountOf, classifyExpense, expenseItemsOf } from "./classify";
import type {
  BusinessTemplate,
  KeiriPayment,
  KeiriReport,
  KeiriSettings,
  PaymentKind,
} from "./types";

/** 出店場所が空のときにまとめる名前 */
export const UNSET_LOCATION = "未設定";

// ------------------------------------------------------------------
// 日付のあつかい（YYYY-MM-DD の文字のまま比べる。時差でズレないように）
// ------------------------------------------------------------------

/** 「2026-08」のような月の文字列を作る */
export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** その月の初日（YYYY-MM-DD） */
export function monthStart(ym: string): string {
  return `${ym}-01`;
}

/** その月の末日（YYYY-MM-DD）。うるう年も正しく出る */
export function monthEnd(ym: string): string {
  const [y, m] = ym.split("-").map((v) => parseInt(v, 10));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(last).padStart(2, "0")}`;
}

/** その日付が月に入っているか */
export function inMonth(date: string, ym: string): boolean {
  return typeof date === "string" && date.slice(0, 7) === ym;
}

/** 日付（YYYY-MM-DD）から月（YYYY-MM）を取り出す */
export function ymOf(date: string): string {
  return (date ?? "").slice(0, 7);
}

/**
 * fromYm から toYm まで（どちらも含む）の月を並べる。
 * from が to より後なら空。家賃のように「毎月きまった額」を数えるのに使う。
 */
export function monthsInRange(fromYm: string, toYm: string): string[] {
  if (!fromYm || !toYm || fromYm > toYm) return [];
  const out: string[] = [];
  let [y, m] = fromYm.split("-").map((v) => parseInt(v, 10));
  // 念のための上限（1000か月＝約83年）。壊れた設定で無限ループしないように
  for (let i = 0; i < 1000; i++) {
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    if (ym > toYm) break;
    out.push(ym);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

// ------------------------------------------------------------------
// 月次のまとめ（試算表の中身）
// ------------------------------------------------------------------

/** 対応表に当たらず雑費に入れた明細（画面下に出して、あとから直せるようにする） */
export type UnmatchedExpense = {
  date: string;
  description: string;
  amount: number;
};

export type MonthlySummary = {
  /** 対象の月（YYYY-MM） */
  ym: string;
  /** 売上高 */
  sales: number;
  /** 科目ごとの経費（人件費・外注費・家賃も入る） */
  expenseByAccount: Record<ExpenseAccountKey, number>;
  /** 経費の合計（人件費・外注費・家賃を含む） */
  expenseTotal: number;
  /** 利益 ＝ 売上高 − 経費合計 */
  profit: number;
  /** 人件費（日報の日当の合計。月に1回まとめて払う分） */
  payroll: number;
  /** 人件費のうち、レジのお金からその日に払った分（docs/keiri.md 3-3） */
  payrollDaily: number;
  /** 外注費（売上高 × 率） */
  outsourcing: number;
  /** 家賃（事務所。毎月きまった額） */
  rent: number;
  /** 集計に使った日報の件数 */
  reportCount: number;
  /** 雑費に入れた（対応表に当たらなかった）明細 */
  unmatched: UnmatchedExpense[];
};

function emptyExpenseByAccount(): Record<ExpenseAccountKey, number> {
  const out = {} as Record<ExpenseAccountKey, number>;
  for (const a of EXPENSE_ACCOUNTS) out[a.key] = 0;
  return out;
}

/**
 * 画面に出すために、まとめ先のある科目を合算する。
 *
 * いまのところ「人件費（当日払い）」→「人件費」の1つだけです。
 * 計算の中では別々に持っています（現金の減り方が違うため。docs/keiri.md 3-3）が、
 * 人が見る表とグラフでは「人件費」1行にまとめて出します。
 */
export function mergedExpenseByAccount(
  byAccount: Record<ExpenseAccountKey, number>,
): Record<ExpenseAccountKey, number> {
  const out = emptyExpenseByAccount();
  for (const a of EXPENSE_ACCOUNTS) {
    const target = (a.mergeInto ?? a.key) as ExpenseAccountKey;
    out[target] += byAccount[a.key] ?? 0;
  }
  return out;
}

/** 外注費（Alpha）を出す。売上高 × 率。端数は四捨五入 */
export function calcOutsourcing(sales: number, rate: number): number {
  const s = Number(sales) || 0;
  const r = Number(rate) || 0;
  return Math.round(s * r);
}

/**
 * その月の家賃（事務所）を出す。
 *
 * 数え始める月（rent_start_month）以降なら毎月きまった額、それより前の月は0円。
 * ★日報からは取りません（docs/keiri.md 5-3b）。
 */
export function rentForMonth(ym: string, settings: KeiriSettings): number {
  const start = settings.rent_start_month || "";
  const amount = Number(settings.monthly_rent) || 0;
  if (!start || !ym || ym < start) return 0;
  return amount;
}

/**
 * その月の科目ごとの集計を出す。
 *
 * ★計上日は日報の `date`（営業日）です。入力日時（created_at）ではありません。
 */
export function summarizeMonth(params: {
  ym: string;
  reports: KeiriReport[];
  template: BusinessTemplate;
  settings: KeiriSettings;
}): MonthlySummary {
  const { ym, reports, template, settings } = params;
  const target = reports.filter((r) => inMonth(r.date, ym));

  const expenseByAccount = emptyExpenseByAccount();
  const unmatched: UnmatchedExpense[] = [];
  let sales = 0;
  let payroll = 0;

  for (const r of target) {
    sales += Number(r.sales_amount) || 0;
    payroll += Number(r.labor) || 0;
    for (const item of expenseItemsOf(r.expenses)) {
      const amount = amountOf(item);
      const { account, matched } = classifyExpense(item.description, template);
      expenseByAccount[account] += amount;
      if (!matched) {
        unmatched.push({
          date: r.date,
          description: (item.description || "").trim() || "（説明なし）",
          amount,
        });
      }
    }
  }

  // 日報に無い、毎月きまって発生するお金を足す（docs/keiri.md 5-2）
  const outsourcing = calcOutsourcing(sales, settings.outsourcing_rate);
  const rent = rentForMonth(ym, settings);
  expenseByAccount.payroll += payroll;
  expenseByAccount.outsourcing += outsourcing;
  expenseByAccount.rent += rent;

  const expenseTotal = EXPENSE_ACCOUNTS.reduce(
    (s, a) => s + expenseByAccount[a.key],
    0,
  );

  unmatched.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    ym,
    sales,
    expenseByAccount,
    expenseTotal,
    profit: sales - expenseTotal,
    payroll,
    payrollDaily: expenseByAccount.payroll_daily,
    outsourcing,
    rent,
    reportCount: target.length,
    unmatched,
  };
}

// ------------------------------------------------------------------
// まだ払っていないお金（給与・外注費・家賃）
// ------------------------------------------------------------------

export type Unpaid = {
  /** 期首日以降に発生した給与の累計 */
  payrollAccrued: number;
  /** 期首日以降に払った給与の累計 */
  payrollPaid: number;
  /** まだ払っていない給与 */
  payroll: number;
  /** 期首日以降に発生した外注費の累計 */
  outsourcingAccrued: number;
  /** 期首日以降に払った外注費の累計 */
  outsourcingPaid: number;
  /** まだ払っていない外注費 */
  outsourcing: number;
  /** 期首日以降に発生した家賃の累計 */
  rentAccrued: number;
  /** 期首日以降に払った家賃の累計 */
  rentPaid: number;
  /** まだ払っていない家賃 */
  rent: number;
  /** 合計（給与＋外注費＋家賃） */
  total: number;
};

/** 支払い記録の合計（期首日以降・種別ごと） */
export function sumPayments(
  payments: KeiriPayment[],
  kind: PaymentKind,
  openingDate: string,
): number {
  return payments
    .filter((p) => p.kind === kind && p.paid_on >= openingDate)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
}

/**
 * 家賃（事務所）の発生の累計を出す。
 *
 * 「数え始める月」から「今月」までの月数 × 毎月の家賃。
 * ★数え始める月が期首日の月より前なら、期首日の月から数えます。
 *   期首日の時点で未払いは0円だったからです（docs/keiri.md 4章）。
 */
export function calcRentAccrued(settings: KeiriSettings, currentYm: string): number {
  const openingYm = ymOf(settings.opening_date);
  const start =
    (settings.rent_start_month || "") > openingYm
      ? settings.rent_start_month
      : openingYm;
  return monthsInRange(start, currentYm).reduce(
    (sum, ym) => sum + rentForMonth(ym, settings),
    0,
  );
}

/**
 * まだ払っていないお金を出す。
 *
 * ★「累計」は期首日（数え始めの日）以降を数えます。
 *   期首日は「7月分の給与を払い終えて残高0円になった日」なので、
 *   その時点で未払いも0円だったからです（docs/keiri.md 4章）。
 *
 * - 給与　… 期首日以降の日報の日当を足す
 *           （★「人件費（当日払い）」は入れません。もう払っているためです。docs/keiri.md 3-3）
 * - 外注費… 「月ごとに、その月の（期首日以降の）売上高 × 率」を足す
 * - 家賃　… 「数え始める月から今月まで」の月数 × 毎月の家賃
 *
 * `currentYm`（今月・YYYY-MM）は家賃を何か月ぶん数えるかに使います。
 * 画面から今日の月を渡してください（テストで固定できるように引数にしてあります）。
 */
export function calcUnpaid(params: {
  reports: KeiriReport[];
  payments: KeiriPayment[];
  settings: KeiriSettings;
  currentYm: string;
}): Unpaid {
  const { reports, payments, settings, currentYm } = params;
  const from = settings.opening_date;

  const since = reports.filter((r) => typeof r.date === "string" && r.date >= from);

  const payrollAccrued = since.reduce((s, r) => s + (Number(r.labor) || 0), 0);

  // 月ごとの売上を出してから、月ごとに率をかける（月単位で切り上げ／四捨五入するため）
  const salesByMonth = new Map<string, number>();
  for (const r of since) {
    const ym = ymOf(r.date);
    salesByMonth.set(ym, (salesByMonth.get(ym) ?? 0) + (Number(r.sales_amount) || 0));
  }
  let outsourcingAccrued = 0;
  for (const s of Array.from(salesByMonth.values())) {
    outsourcingAccrued += calcOutsourcing(s, settings.outsourcing_rate);
  }

  const rentAccrued = calcRentAccrued(settings, currentYm);

  const payrollPaid = sumPayments(payments, "payroll", from);
  const outsourcingPaid = sumPayments(payments, "outsourcing", from);
  const rentPaid = sumPayments(payments, "rent", from);

  const payroll = payrollAccrued - payrollPaid;
  const outsourcing = outsourcingAccrued - outsourcingPaid;
  const rent = rentAccrued - rentPaid;

  return {
    payrollAccrued,
    payrollPaid,
    payroll,
    outsourcingAccrued,
    outsourcingPaid,
    outsourcing,
    rentAccrued,
    rentPaid,
    rent,
    total: payroll + outsourcing + rent,
  };
}

// ------------------------------------------------------------------
// 今の現金
// ------------------------------------------------------------------

export type CashPosition = {
  openingBalance: number;
  openingDate: string;
  /** 期首日以降の売上合計 */
  sales: number;
  /** 期首日以降の経費合計（日報の明細の合計。＝人件費（当日払い）は含み、日当・外注費・家賃は含まない） */
  expenses: number;
  /** 期首日以降に払った給与・外注費・家賃の合計 */
  paid: number;
  /** 今の現金 */
  balance: number;
};

/**
 * 今の現金を出す。
 *
 *   今の現金 = 期首残高
 *            + 期首日以降の売上合計
 *            − 期首日以降の経費合計（人件費・外注費・家賃を除く）
 *            − 給与・Alpha・家賃への支払いの累計
 *
 * ★経費の明細は「人件費（日報の日当）」「外注費」「家賃」には振り分けない決まりなので
 *   （docs/keiri.md 3-2）、「この3つを除いた経費合計」＝「日報の経費明細の合計」になります。
 *
 * ★「人件費（当日払い）」はレジのお金からその日に出ているので、
 *   明細の合計に**入ったまま**で正しいです（docs/keiri.md 3-3）。
 *   ここから外すと、実際には減っているお金が減らないことになってしまいます。
 */
export function calcCashPosition(params: {
  reports: KeiriReport[];
  payments: KeiriPayment[];
  settings: KeiriSettings;
}): CashPosition {
  const { reports, payments, settings } = params;
  const from = settings.opening_date;
  const since = reports.filter((r) => typeof r.date === "string" && r.date >= from);

  const sales = since.reduce((s, r) => s + (Number(r.sales_amount) || 0), 0);
  const expenses = since.reduce(
    (s, r) =>
      s + expenseItemsOf(r.expenses).reduce((t, item) => t + amountOf(item), 0),
    0,
  );
  const paid =
    sumPayments(payments, "payroll", from) +
    sumPayments(payments, "outsourcing", from) +
    sumPayments(payments, "rent", from);

  const opening = Number(settings.opening_balance) || 0;

  return {
    openingBalance: opening,
    openingDate: from,
    sales,
    expenses,
    paid,
    balance: opening + sales - expenses - paid,
  };
}

// ------------------------------------------------------------------
// 出店場所ごとのまとめ
// ------------------------------------------------------------------

export type LocationSummary = {
  /** 名寄せ後の出店場所名（空は「未設定」） */
  location: string;
  sales: number;
  /** 日報の経費明細の合計 */
  expenses: number;
  /** 人件費（その場所の日報の日当） */
  payroll: number;
  /** 経費合計（明細＋人件費）。※外注費と家賃は月単位なので入れない */
  costTotal: number;
  /** 利益 ＝ 売上 − 経費合計 */
  profit: number;
  /** 日報の件数 */
  reportCount: number;
};

/**
 * その月の出店場所ごとの売上・経費・利益。
 *
 * ★外注費（Alpha）と家賃（事務所）は月単位で決まるお金なので、
 *   場所ごとには割り振りません（勝手な按分をしないため）。
 *   場所別の合計と、月次の表の利益は、この2つのぶんだけ差が出ます。
 *
 * ★出店場所の書き方のゆれは lib/locationName.ts で揃えます（CLAUDE.md 4-4）。
 *   過去の日報は書き換えません。
 */
export function summarizeByLocation(params: {
  ym: string;
  reports: KeiriReport[];
}): LocationSummary[] {
  const { ym, reports } = params;
  const map = new Map<string, LocationSummary>();

  for (const r of reports.filter((x) => inMonth(x.date, ym))) {
    const raw = (r.location || "").trim();
    const name = raw ? canonicalLocationName(raw) : UNSET_LOCATION;
    let row = map.get(name);
    if (!row) {
      row = {
        location: name,
        sales: 0,
        expenses: 0,
        payroll: 0,
        costTotal: 0,
        profit: 0,
        reportCount: 0,
      };
      map.set(name, row);
    }
    row.sales += Number(r.sales_amount) || 0;
    row.payroll += Number(r.labor) || 0;
    row.expenses += expenseItemsOf(r.expenses).reduce(
      (t, item) => t + amountOf(item),
      0,
    );
    row.reportCount += 1;
  }

  const rows = Array.from(map.values());
  for (const row of rows) {
    row.costTotal = row.expenses + row.payroll;
    row.profit = row.sales - row.costTotal;
  }
  rows.sort((a, b) => b.sales - a.sales);
  return rows;
}

// ------------------------------------------------------------------
// グラフ用（その月の経費の内訳）
// ------------------------------------------------------------------

export type ExpenseSlice = { key: AccountKey; label: string; value: number };

/** ドーナツグラフ用に、金額が0より大きい科目だけを取り出す */
export function expenseSlices(summary: MonthlySummary): ExpenseSlice[] {
  const merged = mergedExpenseByAccount(summary.expenseByAccount);
  return DISPLAY_EXPENSE_ACCOUNTS.map((a) => ({
    key: a.key as AccountKey,
    label: a.label,
    value: merged[a.key],
  })).filter((s) => s.value > 0);
}
