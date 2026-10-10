/**
 * Instagram投稿モードの「週ごとの予定」で使う、日付の道具。
 *
 * ■ 決めごと
 *   ・1週間は **月曜はじまり・日曜おわり**（出店予定表を月曜から書く運用に合わせる）
 *   ・日付は "2026-10-12" の形の文字だけで扱う。
 *     時計（タイムゾーン）を通すと、朝早い時間に1日ずれることがあるため。
 */

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

function parse(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function format(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 端末の「今日」を "2026-10-12" の形にする（端末の時計どおり） */
export function toYmd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function addDays(ymd: string, n: number): string {
  const d = parse(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return format(d);
}

/** 曜日の番号（0=日 … 6=土） */
export function dowOf(ymd: string): number {
  return parse(ymd).getUTCDay();
}

/** その日をふくむ週の月曜日 */
export function mondayOf(ymd: string): string {
  const dow = dowOf(ymd);
  return addDays(ymd, dow === 0 ? -6 : 1 - dow);
}

/**
 * 画面を開いたときに最初に出す週。
 * 土曜・日曜に開いたら **次の週** を出す（来週の告知を作る時間帯のため）。
 * 月〜金は今週。どちらも ◀ ▶ で前後の週に動かせる。
 */
export function defaultWeekStart(todayYmd: string): string {
  const dow = dowOf(todayYmd);
  const monday = mondayOf(todayYmd);
  return dow === 6 || dow === 0 ? addDays(monday, 7) : monday;
}

/** 月曜から日曜までの7日ぶん */
export function weekDates(mondayYmd: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayYmd, i));
}

/** "10/12" の形 */
export function shortDate(ymd: string): string {
  const d = parse(ymd);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export function dayName(ymd: string): string {
  return DAY_NAMES[dowOf(ymd)];
}

/** "10/12（月）〜 10/18（日）" の形 */
export function weekLabel(mondayYmd: string): string {
  const end = addDays(mondayYmd, 6);
  return `${shortDate(mondayYmd)}（${dayName(mondayYmd)}）〜 ${shortDate(end)}（${dayName(end)}）`;
}

/** "09:30:00" と "14:30:00" → "9:30〜14:30"。開店時刻が無ければ空文字 */
export function hoursLabel(
  open: string | null | undefined,
  close: string | null | undefined,
): string {
  const fmt = (t: string) => {
    const [h, m] = t.split(":");
    return `${Number(h)}:${m}`;
  };
  if (!open) return "";
  return close ? `${fmt(open)}〜${fmt(close)}` : `${fmt(open)}〜`;
}
