/** 金種別枚数 */
export type CashCoinCounts = {
  c1?: number;
  c5?: number;
  c10?: number;
  c50?: number;
  c100?: number;
  c500?: number;
  b1000?: number;
  b5000?: number;
  b10000?: number;
};

/** 設営後チェックの完全レコード */
export interface SetupCheckRecord {
  id?: string;
  created_at?: string;
  date: string;
  location: string;
  location_id: number | null;
  staff_name: string;
  team_unit: 1 | 2;
  register_coins: CashCoinCounts;
  register_total: number;
  previous_register_total: number | null;
  previous_check_date: string | null;
  cash_diff: number | null;
  sales_target: number | null;
  sns_posted: boolean;
  note: string;
  line_posted_at: string | null;
  line_text: string | null;
}

/** 当日のシフト1件分（API today レスポンス要素） */
export interface TodayShiftEntry {
  date: string;
  location: string;
  location_id: number | null;
  staff_name: string;
  team_unit: 1 | 2;
  sales_target: number | null;
  previous_register_total: number | null;
  previous_check_date: string | null;
}

/** API today のレスポンス */
export interface TodaySetupContext {
  date: string;
  shifts: TodayShiftEntry[];
}

/** 標準値（参考表示用） */
export const STANDARD_CASH_AMOUNT = 30000;
