/**
 * 日本の祝日判定（2026年版）
 * Instagram投稿モードのカレンダー色分けで使用
 */

const HOLIDAYS_2026: Record<string, string> = {
  "2026-01-01": "元日",
  "2026-01-12": "成人の日",
  "2026-02-11": "建国記念の日",
  "2026-02-23": "天皇誕生日",
  "2026-03-20": "春分の日",
  "2026-04-29": "昭和の日",
  "2026-05-03": "憲法記念日",
  "2026-05-04": "みどりの日",
  "2026-05-05": "こどもの日",
  "2026-05-06": "振替休日",
  "2026-07-20": "海の日",
  "2026-08-11": "山の日",
  "2026-09-21": "敬老の日",
  "2026-09-23": "秋分の日",
  "2026-10-12": "スポーツの日",
  "2026-11-03": "文化の日",
  "2026-11-23": "勤労感謝の日",
};

/** 指定日が祝日かどうか判定（YYYY-MM-DD形式） */
export function isHoliday(dateStr: string): boolean {
  return dateStr in HOLIDAYS_2026;
}

/** 指定日が土日祝かどうか判定（YYYY-MM-DD形式） */
export function isWeekendOrHoliday(dateStr: string): boolean {
  if (isHoliday(dateStr)) return true;
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}
