/**
 * 「**数えるその日**に出店があって、まだ日報が入っていないか」を見る所
 * （2026-11-12・kp245・f1-4）。**計算だけ**（倉庫は触りません・金額は1円も作りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   日報が入っていない日の見張り（lib/keiri/cashBooksGapOpen.ts）は、
 *   **数える日そのものを わざと外しています**。その日の日報は営業が終わってから
 *   入るものなので、入れてしまうと「営業日なのに日報が無い」といつでも言うことになり、
 *   金庫を数えた日は いつも合否が出ない形になるからです。その判断は正しいままです。
 *
 *   ただ、そのせいで**穴が1つ**残ります。
 *   じゅんが「出店のあった日の夜、日報を出す前」に金庫を数えると、
 *   金庫にはその日の売上が入っているのに、計算上の現金には入っていません。
 *   ＝ **そのぶん必ず食い違い**、しかも差の内わけには何も出ないので
 *   「よく分からない差」で終わります。1分が実りません。
 *
 * ■ どうするか
 *   **押してもらう前に**ひとこと出すだけです。
 *   数える日に出店の予定があって、その日の日報がまだ入っていなければ
 *   「先にその日の日報を出してから数えてください」と言います。
 *
 * ■ ここでしないこと（大事）
 *   ① 合否（f1-4）の決め方は**1文字も変えません**。ここは押す前の一言だけです
 *   ② 金額を作らない・直さない。月の経費・利益・1枚の要約・CSV・試算表は1円も変わりません
 *   ③ 読めなかったときに「出店はありません」と言いません（0件を「無い」と取り違えない）
 *   ④ 日報を作りません・直しません
 */

import {
  SHIFT_SHELF_NOT_MEASURED,
  shiftShelfStaleLine,
  type ShiftShelfFresh,
} from "./shiftShelfFresh";

/** 数える日の見立て */
export type CashCountDay = {
  /** その日に出店の予定があったかを読めたか */
  readable: boolean;
  /** 数える日に出店の予定があるか */
  openOnCountDay: boolean;
  /** その日の日報がもう入っているか */
  reportIn: boolean;
  /** 先にその日の日報を出してから数えたほうがよいか */
  waitForReport: boolean;
  /**
   * 出店予定の表が、数える日まで入っているか（2026-11-14・f1-4）。
   * false＝表がその前で止まっているので「出店の予定がありません」とは言えません。
   */
  shelfCoversDay: boolean | null;
  /** そのまま出す1行 */
  line: string;
};

function monthDay(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  return `${Number(m[2])}月${Number(m[3])}日`;
}

/**
 * 数える日の見立てを決める。
 *
 * @param date        数える日（まだ数えていなければ今日。YYYY-MM-DD）
 * @param shiftToday  その日に出店の予定があったか（**読めなければ null**）
 * @param reportIn    その日の日報がもう入っているか
 */
export function measureCashCountDay(params: {
  date: string;
  shiftToday: boolean | null;
  reportIn: boolean;
  /** 出店予定の表の新しさ（渡さなければ今までどおりの言い方） */
  shelf?: ShiftShelfFresh;
}): CashCountDay {
  const { date, shiftToday, reportIn } = params;
  const shelf = params.shelf ?? SHIFT_SHELF_NOT_MEASURED;
  const day = monthDay(date);

  if (shiftToday === null) {
    return {
      readable: false,
      openOnCountDay: false,
      reportIn,
      waitForReport: false,
      shelfCoversDay: shelf.coversSince,
      line:
        `数える日（${day}）に出店があったかは読めませんでした。` +
        "出店した日なら、**その日の日報を出してから**数えてください" +
        "（出さずに数えると、その日の売上のぶんだけ食い違います）。",
    };
  }

  if (!shiftToday) {
    // ★表がその日まで入っていないときは「出店の予定がありません」と言わない
    //   （2026-11-14・f1-4）。入れる人がいなくなった表の 0件 は「無い」の証しに
    //   なりません。
    if (shelf.coversSince === false) {
      return {
        readable: true,
        openOnCountDay: false,
        reportIn,
        waitForReport: false,
        shelfCoversDay: false,
        line:
          `数える日（${day}）に出店の予定は入っていませんが、` +
          `${shiftShelfStaleLine(shelf)}ので、お休みかどうかはこの表からは分かりません。` +
          (reportIn
            ? "その日の日報はもう入っています＝そのまま数えて大丈夫です。"
            : "出店した日なら、**その日の日報を出してから**数えてください" +
              "（出さずに数えると、その日の売上のぶんだけ食い違います）。"),
      };
    }
    return {
      readable: true,
      openOnCountDay: false,
      reportIn,
      waitForReport: false,
      shelfCoversDay: shelf.coversSince,
      line: `数える日（${day}）は出店の予定がありません＝そのまま数えて大丈夫です。`,
    };
  }

  if (reportIn) {
    return {
      readable: true,
      openOnCountDay: true,
      reportIn: true,
      waitForReport: false,
      shelfCoversDay: shelf.coversSince,
      line:
        `数える日（${day}）は出店がありますが、その日の日報はもう入っています` +
        "＝そのまま数えて大丈夫です。",
    };
  }

  return {
    readable: true,
    openOnCountDay: true,
    reportIn: false,
    waitForReport: true,
    shelfCoversDay: shelf.coversSince,
    line:
      `数える日（${day}）は出店の予定があり、**その日の日報がまだ入っていません**。` +
      "先にその日の日報を出してから数えてください" +
      "（出さずに数えると、その日の売上のぶんだけ金庫のほうが多く出て、" +
      "差の内わけにも出ないので「よく分からない差」で終わります）。",
  };
}

/** 読めていない・まだ見ていないときの既定（「出店はありません」とは言わない） */
export const UNKNOWN_CASH_COUNT_DAY: CashCountDay = {
  readable: false,
  openOnCountDay: false,
  reportIn: false,
  waitForReport: false,
  shelfCoversDay: null,
  line: "数える日に出店があったかは、まだ見ていません。",
};
