/**
 * 「日報が入っていない日は、**営業した日**なのか、お休みだったのか」を数える所
 * （2026-11-09・f1-4）。**計算だけ**（倉庫は触りません・金額は1円も作りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   「今の現金」は日報の売上を足し、日報の経費を引いて出します。
 *   ＝ **営業したのに日報が入っていない日があると、その分だけ必ず食い違います。**
 *   そこで「日報はここまで入っています」という一言は、もう出しています
 *   （lib/keiri/cashBooksGap.ts）。ところがその一言は
 *   **「営業した日があれば」という言い方**でした（休んだ日かもしれないので、
 *   こちらで決めつけない、という決まりです）。
 *
 *   この「かもしれない」が、じゅんの1分を実らなくします。差の内わけを
 *   まとめる所（lib/keiri/cashDiffCoverage.ts）は、空きがあるだけで
 *   **「分からない所がある」**として合否を付けません（covered を null）。
 *   ＝ **空きの正体が お休みだけでも、金庫を数えても f1-4 の合否が出ません。**
 *
 * ■ どうするか
 *   空いている日に**出店の予定（shifts）があったか**を見ます。
 *   予定があって日報が無い日 … 本当に足りない日（ここを先に入れてもらう）
 *   予定が無い日              … お休み（食い違いの元にならない）
 *   予定が読めなかった        … 今までどおり「分かりません」のまま（安全側）
 *
 * ■ ここでしないこと（大事）
 *   ① 金額を直しません。月の経費・利益・1枚の要約・会計ソフト向けCSVは1円も変わりません。
 *   ② 日報を作りません・直しません（読むだけ）。
 *   ③ 読めなかったときに「お休みでした」と言いません（0件を「無い」と取り違えない）。
 */

/** 空きの正体 */
export type CashBooksGapOpen = {
  /** 予定が読めたか（読めなければ、ここから下は当てにしない） */
  readable: boolean;
  /** 空いている日のうち、出店の予定があって日報が無い日の数 */
  openDays: number;
  /** 空いている日のうち、予定が無かった日（お休み）の数 */
  closedDays: number;
  /** 予定があって日報が無い、いちばん古い日／新しい日（金額ではない） */
  firstDate: string | null;
  lastDate: string | null;
  /** 空きが「お休みだけ」と言い切れるか（読めて、足りない日が0のときだけ true） */
  holidaysOnly: boolean;
  /** 人が読む一言（お店の名前・担当者の名前・金額は入れない） */
  note: string;
};

export const EMPTY_CASH_BOOKS_GAP_OPEN: CashBooksGapOpen = {
  readable: false,
  openDays: 0,
  closedDays: 0,
  firstDate: null,
  lastDate: null,
  holidaysOnly: false,
  note: "日報が空いている日はありません（この行は出ません）。",
};

function monthDay(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  return `${Number(m[2])}月${Number(m[3])}日`;
}

/**
 * 空きの正体を数える。
 *
 * @param gapDates    日報が入っていない日（YYYY-MM-DD の並び）
 * @param shiftDates  その範囲にあった出店の予定の日（読めなければ null）
 */
export function measureBooksGapOpen(params: {
  gapDates: string[];
  shiftDates: string[] | null;
}): CashBooksGapOpen {
  const { gapDates } = params;
  if (gapDates.length === 0) return EMPTY_CASH_BOOKS_GAP_OPEN;

  // ★読めなかったときは「お休みでした」と言わない（安全側）
  if (params.shiftDates === null) {
    return {
      readable: false,
      openDays: 0,
      closedDays: 0,
      firstDate: null,
      lastDate: null,
      holidaysOnly: false,
      note:
        `日報が ${gapDates.length}日 空いていますが、その日に出店の予定があったかは` +
        "読めませんでした。お休みだったのか、日報がまだなのかは分かりません。",
    };
  }

  const planned = new Set(params.shiftDates);
  const open = gapDates.filter((d) => planned.has(d)).sort();
  const closedDays = gapDates.length - open.length;

  if (open.length === 0) {
    return {
      readable: true,
      openDays: 0,
      closedDays,
      firstDate: null,
      lastDate: null,
      holidaysOnly: true,
      note:
        `日報が ${gapDates.length}日 空いていますが、その ${gapDates.length}日は` +
        "ぜんぶ出店の予定が無い日（お休み）でした＝この空きで食い違うことはありません。",
    };
  }

  const first = open[0];
  const last = open[open.length - 1];
  return {
    readable: true,
    openDays: open.length,
    closedDays,
    firstDate: first,
    lastDate: last,
    holidaysOnly: false,
    note:
      `出店の予定があったのに日報が入っていない日が ${open.length}日 あります` +
      `（${monthDay(first)}〜${monthDay(last)}）。` +
      "その日の売上と経費が入っていないので、いま金庫を数えると そのぶん必ず食い違います。" +
      "先にその日報を入れてから数えてください。",
  };
}

/**
 * 日報が入っていない日を並べる（いちばん新しい日の次の日から、比べる日の**前の日**まで）。
 *
 * ★比べる日そのもの（ふつうは今日）は入れません。その日の日報は営業が終わってから
 *   入るものなので、入れると「営業日なのに日報が無い」といつでも言うことになり、
 *   金庫を数えた日は いつも合否が出ない形になります。
 */
export function booksGapDates(params: {
  /** 日報のいちばん新しい日（YYYY-MM-DD） */
  lastDate: string;
  /** 比べる日（金庫を数えた日。まだなら今日） */
  asOf: string;
  /** 数えすぎない上限（日） */
  max?: number;
}): string[] {
  const max = params.max ?? 120;
  const out: string[] = [];
  const start = new Date(`${params.lastDate}T00:00:00Z`);
  const end = new Date(`${params.asOf}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  for (let i = 1; i <= max; i += 1) {
    const d = new Date(start.getTime() + i * 86_400_000);
    if (d.getTime() >= end.getTime()) break;
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
