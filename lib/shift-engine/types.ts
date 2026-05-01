/**
 * シフト推奨エンジンの共通型定義。
 *
 * Step 1 (nagayama-selector) → NagayamaSuggestion
 * Step 2-3 (extra-stores) → FullSchedule
 * Step 4 (staff-assigner) → byDay: ShiftStoreWithStaff[]
 * 統合 (index.ts) → MonthlyShift
 */

/** Step 1 の出力。ながやま選定結果 */
export interface NagayamaSuggestion {
  /** 推奨選定された出店日（PDFの空き枠から選んだ。dayの配列、ソート済み） */
  byStore: Record<string, number[]>;
  /** PDFで既に「手羽屋」となっている確定日（dayの配列、ソート済み） */
  confirmedByStore: Record<string, number[]>;
  warnings: string[];
}

/** Step 2-3 の出力 / Step 4 の入力。日ごとの店舗配置 */
export interface FullSchedule {
  /** day → 店舗名の配列（最大2件） */
  byDay: Record<number, string[]>;
  warnings: string[];
}

/** Step 4 の出力エントリ */
export interface ShiftStoreWithStaff {
  storeName: string;
  staffName: string | null;
  note: string | null;
}

/** 1日×1店舗のシフトエントリ（最終形） */
export interface ShiftStore {
  storeName: string;
  locationId: number | null;
  rank: string | null;
  target: number | null;
  staffName: string | null;
  note: string | null;
}

/** 1日分のシフト */
export interface ShiftDay {
  day: number;
  date: string; // ISO "YYYY-MM-DD"
  weekday: number; // JS getDay (0=日, 6=土)
  stores: ShiftStore[];
}

/** 月次シフト全体（generateMonthlyShift の戻り値） */
export interface MonthlyShift {
  year: number;
  month: number;
  days: ShiftDay[];
  warnings: string[];
  staffSummary: Record<string, number>;
}
