/**
 * 事例1号（手羽屋）の数字を、日報データから自動で出す。
 *
 * ■ なぜ作ったか
 *   紹介ページの数字を手で書いていると、月が変わるたびに古くなる。
 *   「2026年8月の実績」と書いたまま年を越すと、それだけで信用を失う。
 *
 * ■ 決めごと
 *   - 数えるのは **前の月（まるまる終わった月）** だけ。途中の月は「実績」と呼べない
 *   - 集計に使うのは合計だけ。経費の明細は取りに行かない（CLAUDE.md 4-2）
 *   - 利益は **実績ベース**（calcActualProfit）。推定（食材25%・場代10%）は使わない
 *   - 倉庫が読めない・日報が1件も無いときは **手で確認した控えの数字に戻す**。
 *     数字を作らない・空欄にしない（CLAUDE.md 4-10 と同じ考え方）
 *   - 読むだけ。書き込みはしない
 */

import { calcActualProfit, expensesTotalOf } from "@/lib/money";
import { serverClient } from "@/lib/supabaseServer";
import { CASE_TEBAYA } from "@/lib/keiri/caseNumbers";

/** 紹介ページに出す1か月の実績 */
export type CaseStats = {
  /** 「2026年8月」 */
  month: string;
  /** 出店した回数（日報の件数） */
  days: number;
  /** 売上高（万円・小数1桁） */
  salesMan: number;
  /** 実績ベースの利益（万円・小数1桁） */
  profitMan: number;
  /** 数字を確認した日（自動なら集計した日） */
  checkedOn: string;
  /** 日報から自動で出した数字か（false＝手で確認した控え） */
  auto: boolean;
};

type ReportRow = {
  date: string;
  sales_amount: number | null;
  labor: number | null;
  expenses_total?: number | null;
  expenses?: unknown;
};

/** 円 → 万円（小数1桁）。0.05万円未満は 0 になる */
export function toMan(yen: number): number {
  return Math.round((yen / 10000) * 10) / 10;
}

/** 前の月の範囲（YYYY-MM-01 〜 月末）と表示名 */
export function previousMonthRange(today: Date): { start: string; end: string; label: string } {
  const y = today.getFullYear();
  const m = today.getMonth(); // 0始まり。今月
  const prev = new Date(y, m - 1, 1);
  const py = prev.getFullYear();
  const pm = prev.getMonth() + 1;
  const lastDay = new Date(py, pm, 0).getDate();
  const mm = String(pm).padStart(2, "0");
  return {
    start: `${py}-${mm}-01`,
    end: `${py}-${mm}-${String(lastDay).padStart(2, "0")}`,
    label: `${py}年${pm}月`,
  };
}

/** 日報の行から、出店回数・売上・実績利益を出す（純粋な計算。テストはここに掛ける） */
export function summarize(rows: ReportRow[]): { days: number; salesYen: number; profitYen: number } {
  let salesYen = 0;
  let profitYen = 0;
  for (const r of rows) {
    const sales = Number(r.sales_amount) || 0;
    const labor = Number(r.labor) || 0;
    salesYen += sales;
    profitYen += calcActualProfit(sales, labor, expensesTotalOf(r)).profit;
  }
  return { days: rows.length, salesYen, profitYen };
}

/** 手で確認した控え（倉庫が読めないとき・日報が無いときはこれを出す） */
export function fallbackStats(): CaseStats {
  return {
    month: CASE_TEBAYA.month,
    days: CASE_TEBAYA.days,
    salesMan: CASE_TEBAYA.salesMan,
    profitMan: CASE_TEBAYA.profitMan,
    checkedOn: CASE_TEBAYA.checkedOn,
    auto: false,
  };
}

/** 前の月の実績を日報から集める。失敗したら控えの数字に戻す（画面は落とさない） */
export async function getCaseStats(today: Date = new Date()): Promise<CaseStats> {
  const { start, end, label } = previousMonthRange(today);
  try {
    const db = serverClient();
    const { data, error } = await db
      .from("daily_reports")
      // 合計だけ。経費の明細（expenses）は取りに行かない（CLAUDE.md 4-2）
      .select("date, sales_amount, labor, expenses_total")
      .gte("date", start)
      .lte("date", end);

    if (error || !data || data.length === 0) return fallbackStats();

    const { days, salesYen, profitYen } = summarize(data as ReportRow[]);
    if (days === 0 || salesYen <= 0) return fallbackStats();

    return {
      month: label,
      days,
      salesMan: toMan(salesYen),
      profitMan: toMan(profitYen),
      checkedOn: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
      auto: true,
    };
  } catch {
    return fallbackStats();
  }
}
