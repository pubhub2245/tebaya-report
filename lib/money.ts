/**
 * お金の計算を、ここ1か所にまとめたファイル。
 *
 * ■ なぜ1か所にまとめるか
 *   同じ計算（粗利の25%・10%、経費の合計）が画面ごとにコピーされていて、
 *   片方だけ直すと画面によって金額が違う、という事故が起きやすい状態でした。
 *   ここに集めて、テスト（tests/money.test.ts）で正しさを固定します。
 *
 * ■ 変更するときの注意
 *   ここを直すと、日報・現金残高・管理者ページ・売上報告・LINE報告文の
 *   すべての金額が同時に変わります。必ずテストを通してから変更してください。
 */

/** 原価の概算率（売上に対する割合）。現場がその場で粗利の目安を見るための推定値。 */
export const COST_RATE_FOOD = 0.25;
/** 場代の概算率（売上に対する割合）。同上。 */
export const COST_RATE_RENT = 0.1;

export type ExpenseLike = { amount?: number | null } & Record<string, unknown>;

/**
 * 経費の明細（jsonb配列）から合計金額を出す。
 * 配列でないもの・数値でないものは0として扱う（壊れたデータで画面が落ちないように）。
 */
export function sumExpenses(expenses: unknown): number {
  if (!Array.isArray(expenses)) return 0;
  return expenses.reduce<number>(
    (sum, e) => sum + (Number((e as ExpenseLike)?.amount) || 0),
    0,
  );
}

/**
 * 日報1件の経費合計を出す。
 *
 * `expenses_total` 列（DB側のトリガーで自動計算）があればそれを使い、
 * 無ければ明細から足す。
 *
 * 集計画面は `expenses_total` だけを取得すれば済むので、
 * レシート写真を含む重い明細をダウンロードせずに合計を出せる。
 */
export function expensesTotalOf(row: {
  expenses_total?: number | null;
  expenses?: unknown;
}): number {
  if (typeof row.expenses_total === "number") return row.expenses_total;
  return sumExpenses(row.expenses);
}

export type GrossProfit = {
  /** 原価概算（売上の25%） */
  food: number;
  /** 場代概算（売上の10%） */
  rent: number;
  /** 日当 */
  labor: number;
  /** 原価概算＋日当＋場代概算 */
  costTotal: number;
  /** 売上 − costTotal */
  profit: number;
};

/**
 * 粗利（現場評価）を出す。
 *
 * ★これは「推定」です。実際に払った仕入や場代は使っていません。
 *   現場がその日のうちに手応えを掴むための目安です。
 *   実績ベースの数字は calcActualProfit を使ってください。
 */
export function calcGrossProfit(sales: number, labor: number): GrossProfit {
  const s = Number(sales) || 0;
  const l = Number(labor) || 0;
  const food = Math.round(s * COST_RATE_FOOD);
  const rent = Math.round(s * COST_RATE_RENT);
  const costTotal = food + l + rent;
  return { food, rent, labor: l, costTotal, profit: s - costTotal };
}

/**
 * 実績ベースの粗利。推定を使わず、実際にレジから払った経費と日当だけを引く。
 *
 * 推定（calcGrossProfit）との違いを見るために使う。
 * 仕入をレジ以外（立替・振込など）で払っている分は入らないので、
 * 「レジから出ていったお金だけで見た粗利」であることに注意。
 */
export function calcActualProfit(
  sales: number,
  labor: number,
  expensesTotal: number,
): { labor: number; expenses: number; costTotal: number; profit: number } {
  const s = Number(sales) || 0;
  const l = Number(labor) || 0;
  const e = Number(expensesTotal) || 0;
  const costTotal = l + e;
  return { labor: l, expenses: e, costTotal, profit: s - costTotal };
}

/**
 * 持ち帰り金額＝その日レジから持ち帰る現金（売上 − レジから払った経費）。
 */
export function calcTakeHome(sales: number, expensesTotal: number): number {
  return (Number(sales) || 0) - (Number(expensesTotal) || 0);
}

export type CashReport = {
  date: string;
  sales_amount?: number | null;
  expenses_total?: number | null;
  expenses?: unknown;
};

export type CashAdvance = {
  amount?: number | null;
  settled?: boolean | null;
  settled_date?: string | null;
  date: string;
};

export type CashBalance = {
  openingBalance: number;
  salesTotal: number;
  expensesTotal: number;
  /** 精算済み（返金した）立替。手元現金から引く */
  settledAdvancesTotal: number;
  /** 未精算の立替。これから返すお金。手元現金には含めない */
  unsettledAdvancesTotal: number;
  balance: number;
  /** 集計に使った日報の件数 */
  reportCount: number;
};

/**
 * 手元現金を計算する。
 *
 *   手元現金 = 期首残高
 *            + 売上合計（起点日以降の日報）
 *            − レジから払った経費の合計（同上）
 *            − 精算済みの立替（起点日以降に返金したもの）
 *
 * startDate が null のときは全期間を対象にする。
 */
export function calcCashBalance(params: {
  openingBalance: number;
  startDate: string | null;
  reports: CashReport[];
  advances: CashAdvance[];
}): CashBalance {
  const { openingBalance, startDate, reports, advances } = params;
  const inPeriod = (d: string) => !startDate || d >= startDate;

  const target = reports.filter((r) => inPeriod(r.date));
  const salesTotal = target.reduce((s, r) => s + (Number(r.sales_amount) || 0), 0);
  const expensesTotal = target.reduce((s, r) => s + expensesTotalOf(r), 0);

  const settledAdvancesTotal = advances
    .filter((a) => a.settled)
    .filter((a) => inPeriod(a.settled_date || a.date))
    .reduce((s, a) => s + (Number(a.amount) || 0), 0);

  const unsettledAdvancesTotal = advances
    .filter((a) => !a.settled)
    .reduce((s, a) => s + (Number(a.amount) || 0), 0);

  const base = Number(openingBalance) || 0;

  return {
    openingBalance: base,
    salesTotal,
    expensesTotal,
    settledAdvancesTotal,
    unsettledAdvancesTotal,
    balance: base + salesTotal - expensesTotal - settledAdvancesTotal,
    reportCount: target.length,
  };
}

// -----------------------------------------------------------------------------
// 出店料（場代）
// -----------------------------------------------------------------------------

/**
 * 出店料（場代）の決まり。**出店場所マスタ（locations）が正**（→ CLAUDE.md 4-15）。
 *
 *   percent … 売上の◯％（例：ながやま系・AZ隼人 = 10％）
 *   fixed   … 定額（例：PASIO系 2,200円 / ニシムタ 5,000円 / イオンモール 8,250円）
 *   none    … 場代が無い（0円）・まだ分かっていない（どちらも自動では入れない）
 */
export type BoothFeeRule = {
  type: "none" | "percent" | "fixed";
  /** percent のときの割合。10 なら売上の10％ */
  rate?: number | null;
  /** fixed のときの金額（円） */
  amount?: number | null;
};

/** 経費に入れる場代の行の「内容」。経理層がこの言葉で出店料に振り分ける */
export const BOOTH_FEE_LABEL = "場代";

/**
 * その日の場代を計算する。
 *
 * ★1円未満は発生しない決まりなので**切り捨て**る（2026-09 確認）。
 * ★決まりが無い（none）ときや、割合・金額が入っていないときは null を返す
 *   （0円を入れてしまうと「無料だった」と嘘の記録になるため）。
 */
export function calcBoothFee(
  rule: BoothFeeRule | null | undefined,
  sales: number,
): number | null {
  if (!rule) return null;
  const s = Math.max(0, Number(sales) || 0);
  if (rule.type === "fixed") {
    const amount = Number(rule.amount);
    return Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : null;
  }
  if (rule.type === "percent") {
    const rate = Number(rule.rate);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    return Math.floor((s * rate) / 100);
  }
  return null;
}

/** 決まりを人に見せる言葉にする（「売上の10％」「定額 ¥5,000」） */
export function boothFeeRuleText(rule: BoothFeeRule | null | undefined): string {
  if (!rule || rule.type === "none") return "なし（0円）";
  if (rule.type === "percent") return `売上の${Number(rule.rate) || 0}％`;
  return `定額 ${(Number(rule.amount) || 0).toLocaleString("ja-JP")}円`;
}
