/**
 * 「初期設定のあと、日報1枚を書いたその日に『今月の利益・今の現金』が出るか」を
 * **外から確かめられる形**にする（f3-3）。
 *
 * ■ なぜ要るか（2026-10-06）
 *   手羽屋では利益も現金も出ています。けれども手羽屋は3か月ぶんのデータが入っている
 *   お店なので、**まっさらな新しいお店（日報が1枚だけ）でも出るか**は確かめられて
 *   いませんでした（f3-3 の「未」の理由がこれです）。
 *   新しいお店で起こりがちな取り違えは2つあります。
 *     ① 日報が1件しか無いと、月のまとめや現金が「出せません」になってしまう
 *     ② 設定がまだ読めないときに、手羽屋の決めごと（家賃 35,000円・売上の10%の外注費）
 *        が当てはめられ、**払っていないお金が経費として出てしまう**
 *   ここでは、まっさらな状態からその2つが起きないことを、本物と同じ関数で確かめます。
 *
 * ■ 守ること
 *   ・計算はここに書かない。**本物と同じ関数**（buildOneSheet → aggregate.ts）に計算させ、
 *     ここでは「別の道で数え直して合うか」だけを見る（検算）。
 *   ・**架空のお店の数字だけ**を使う。手羽屋の実データは1円も混ぜない。
 *   ・1行も書き込まない。
 */

import type { KeiriReport, KeiriSettings } from "./types";
import type { WarehouseAlive } from "@/lib/keiri/warehouseAlive";
import type { MonthlySample } from "./oneSheet";

/** 確かめに使う架空のお店の名前（実在の店名を入れないこと） */
export const FIRST_MONTH_SHOP_NAME = "はじめてのお店（架空）";

/** 架空の日報1件ぶんの中身。ここだけが「材料」で、計算は一切しない */
export const FIRST_MONTH_REPORT = {
  /** その日の売上 */
  sales: 48000,
  /** その日の日当（当日払い） */
  labor: 8000,
  /** レジのお金から払った経費 */
  expenses: [
    { description: "鶏肉 仕入れ", amount: 12000 },
    { description: "場代", amount: 4800 },
  ],
} as const;

/** 新しいお店が初期設定で入れる「金庫の起点」（つり銭として置く額） */
export const FIRST_MONTH_OPENING_BALANCE = 30000;

/** 日報の経費の合計（材料から足すだけ） */
export function firstMonthExpenseSum(): number {
  return FIRST_MONTH_REPORT.expenses.reduce((s, e) => s + e.amount, 0);
}

/**
 * 新しいお店の初期設定。
 * ★決めごとを1つも持たない（家賃0・外注費0）。
 *   よそのお店に手羽屋の決めごとを当てると、払っていない金額が経費に出ます。
 */
export function firstMonthSettings(reportDate: string): KeiriSettings {
  return {
    opening_date: reportDate,
    opening_balance: FIRST_MONTH_OPENING_BALANCE,
    outsourcing_rate: 0,
    monthly_rent: 0,
    rent_start_month: "",
  };
}

/** 日報1枚（架空）。その月の最初の営業日に1件だけ置く */
export function firstMonthReports(reportDate: string): KeiriReport[] {
  return [
    {
      date: reportDate,
      location: "駅前広場",
      staff_name: "スタッフA",
      sales_amount: FIRST_MONTH_REPORT.sales,
      labor: FIRST_MONTH_REPORT.labor,
      expenses: FIRST_MONTH_REPORT.expenses.map((e) => ({ ...e })),
    },
  ];
}

/** まっさらなお店として倉庫を読んだ結果（件数だけ。金額は見ない） */
export type EmptyShopProbe = {
  /** 倉庫から読めたか（読めないのと0件は別もの） */
  readable: boolean;
  /** 日報の件数（0件が正しい） */
  reportCount: number;
  /** 金庫を数えた記録の件数（0件が正しい） */
  cashEventCount: number;
  /** 立替の棚を読まずに飛ばしたか（よそのお店には読まないのが正しい） */
  advancesSkipped: boolean;
};

export type FirstMonthCheck = {
  month: string;
  ym: string;
  /** 日報を書いた日（この日に数字が出るかを見る） */
  reportDate: string;
  /** まっさらなお店として倉庫を読んだ結果 */
  emptyShop: EmptyShopProbe;
  /** 日報1枚を書いたあとに出る数字（架空のお店の数字なので、そのまま出してよい） */
  afterOneReport: {
    reportCount: number;
    sales: number;
    expenseTotal: number;
    profit: number;
    cashBalance: number;
  };
  checks: {
    /**
     * まっさらなお店として読むと、よその店の行が1件も出ないか。
     *
     * ★倉庫（データのしまい場所）が読めなかった日は **null（測れません）** です
     *   （2026-11-07）。前は false を返していたので、読んだ人には
     *   「よその店の行が出ている＝不合格」と見えていました（確かめていないのに）。
     */
    startsEmpty: boolean | null;
    /** 日報1枚でも「今月の利益」が出て、売上−かかったお金と合うか */
    profitShown: boolean;
    /** 日報1枚でも「今の現金」が出て、金庫の起点＋売上−経費と合うか */
    cashShown: boolean;
    /** その1枚の検算（3つとも）が通るか */
    sheetReady: boolean;
    /** 設定がまだ読めないときに、払っていない家賃・外注費を勝手に作らないか */
    noFabricatedCost: boolean;
  };
  /**
   * いま測れたか（2026-11-06・f3-3）。
   * false ＝ 倉庫が読めていないので、**合格にも不合格にもしていません**。
   */
  measurable: boolean;
  /** 倉庫が生きているかを先に1回 確かめた結果（対照） */
  warehouse: WarehouseAlive;
  /** 合格か。**null ＝ 測れなかった**（0件を「合格」と取り違えないため） */
  ok: boolean | null;
  problems: string[];
  summary: string;
  note: string;
};

export const FIRST_MONTH_NOTE =
  "読むだけの窓口です。出している金額はすべて架空のお店のもので、手羽屋の実データは1円も入っていません。1行も書き込みません。";

/** 1枚の要約から「残ったお金（利益）」を取り出す */
function profitOf(sheet: MonthlySample): number {
  const line = sheet.headline.find((h) => h.label.includes("残ったお金"));
  return line ? line.yen : NaN;
}

/** その1枚に、払っていない家賃・外注費が経費として出ていないか */
export function hasFabricatedCost(sheet: MonthlySample): boolean {
  return sheet.expenses.some(
    (e) => e.yen > 0 && (e.label.includes("家賃") || e.label.includes("外注")),
  );
}

/**
 * まっさらなお店＋日報1枚で、利益と現金が出たかを判定する。
 *
 * @param withSetup     初期設定あり（起点＋金庫の起点）＋日報1枚で作った1枚
 * @param withoutSetup  設定がまだ読めないとき（保険の値）＋日報1枚で作った1枚
 */
export function buildFirstMonthCheck(params: {
  month: string;
  ym: string;
  reportDate: string;
  emptyShop: EmptyShopProbe;
  withSetup: MonthlySample;
  withoutSetup: MonthlySample;
  /**
   * 倉庫が生きているかの対照（lib/keiri/warehouseAlive.ts）。
   * ★**よその店が0件だった**ことだけでは何も証明できません。
   *   同じつなぎ方で手羽屋の行が見えて初めて、0件に意味が出ます。
   */
  warehouse: WarehouseAlive;
}): FirstMonthCheck {
  const { month, ym, reportDate, emptyShop, withSetup, withoutSetup, warehouse } = params;

  const sales = withSetup.headline.find((h) => h.label === "売上")?.yen ?? NaN;
  const expenseTotal = withSetup.expenseTotal;
  const profit = profitOf(withSetup);
  const cashBalance = withSetup.cash.balance;

  // 別の道で数え直す（本物の関数の答えと合うか）
  const expectedCash =
    FIRST_MONTH_OPENING_BALANCE + FIRST_MONTH_REPORT.sales - firstMonthExpenseSum();

  const startsEmptyRead =
    emptyShop.readable &&
    emptyShop.reportCount === 0 &&
    emptyShop.cashEventCount === 0 &&
    emptyShop.advancesSkipped;
  const profitShown =
    Number.isFinite(profit) &&
    Number.isFinite(sales) &&
    withSetup.reportCount === 1 &&
    sales - expenseTotal === profit;
  const cashShown = cashBalance === expectedCash;
  const sheetReady = withSetup.verify.ok;
  const noFabricatedCost = !hasFabricatedCost(withoutSetup);

  // 倉庫が読めていないときは、ここから下の「0件」に意味がありません（＝測れない）
  const measurable = warehouse.alive;
  // ★測れなかった日は null（合格にも不合格にもしない）。
  //   false を返すと「よその店の行が出ている」と読めてしまう（2026-11-07・f3-3）。
  const startsEmpty: boolean | null = measurable ? startsEmptyRead : null;

  const problems: string[] = [];
  if (!measurable) problems.push(`いまは測れません：${warehouse.reason}`);
  else if (!startsEmpty)
    problems.push(
      "まっさらなお店として読んだのに、よそのお店の行が出ています（または倉庫から読めませんでした）",
    );
  if (!profitShown)
    problems.push("日報1枚では「今月の利益」が出ません（売上 − かかったお金 と合いません）");
  if (!cashShown)
    problems.push("日報1枚では「今の現金」が、金庫の起点＋売上−経費 と合いません");
  if (!sheetReady) problems.push(...withSetup.verify.problems);
  if (!noFabricatedCost)
    problems.push("設定がまだ読めないときに、払っていない家賃・外注費が経費として出ています");

  // ★測れなかったときは null。**合格にも不合格にもしません**
  const ok: boolean | null = measurable ? problems.length === 0 : null;

  return {
    month,
    ym,
    reportDate,
    emptyShop,
    afterOneReport: {
      reportCount: withSetup.reportCount,
      sales,
      expenseTotal,
      profit,
      cashBalance,
    },
    checks: { startsEmpty, profitShown, cashShown, sheetReady, noFabricatedCost },
    measurable,
    warehouse,
    ok,
    problems,
    summary: !measurable
      ? `いまは測れませんでした（${warehouse.reason}）。` +
        "合格にも不合格にもしていません。倉庫が読めるようになってから、もう一度 開いてください。"
      : ok
      ? `まっさらなお店（倉庫の行は0件）に日報を1枚 書いた${reportDate}の時点で、` +
        `今月の利益 ${profit.toLocaleString("ja-JP")}円 と 今の現金 ${cashBalance.toLocaleString(
          "ja-JP",
        )}円 が出ました。どちらも別の道で数え直して一致しています（架空のお店の数字です）。`
      : `まっさらなお店＋日報1枚では出ていません（${problems.length}件）。`,
    note: FIRST_MONTH_NOTE,
  };
}
