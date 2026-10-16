/**
 * 「会計ソフト向けの表に出るのに、金庫からは引かれない立替の返金」を数えるところ
 * （2026-10-16・kp254・f1-7／f1-4）。**計算だけ**（倉庫は触りません）。
 *
 * ■ なにが食い違っているのか（やさしい説明）
 *   立替（だれかが自分のお金で先に払った経費）を返すと、その日に金庫からお金が出ます。
 *   ところが同じ1件を、2か所がちがう決まりで見ていました。
 *     ・**会計ソフト向けの表**（lib/keiri/journal.ts）… 返した日がその月なら、返金の行を作る
 *     ・**金庫の数え方**（lib/keiri/aggregate.ts）… 返した日が**数え始めの日より後**の分だけ引く
 *   ＝ 数え始めの日より前に返した立替だけ、**表には出るのに金庫からは引かない**。
 *   数え始めより前のお金の出入りは「起点の金庫の金額」にもう含まれているので、
 *   金庫のほうが正しく、表のほうが1行 多い——という形です。
 *
 * ■ このファイルがするのは「数えること」だけ
 *   手羽屋の数え始めは 2026-09-10 なので、9/01〜9/09 に返した立替があると
 *   **9月の表の行数が変わります**（いま124行）。黙って行数を変えないために、
 *   まず外から「何行あるか」を読めるようにします（kp254 の手順①）。
 *
 * ■ 金額は返しません
 *   件数と、そろえたときに**表から減る行数**だけです（lib/keiri/checkWindow.ts の決まり③）。
 */

import type { KeiriAdvance } from "./types";

/** 外から読む形。金額は1円も入れない */
export type AdvanceReturnGapWindow = {
  /** 立替の棚が読めたか（読めていないのに0件と取り違えないため） */
  readable: boolean;
  /** 食い違っているか（1行でもあれば true） */
  differs: boolean;
  /** 数え始めの日（YYYY-MM-DD）。空なら決まっていない */
  openingDate: string;
  /** 返した日がその月で、かつ数え始めの日より前の立替の行数 */
  rows: number;
  /** 金庫の決まりにそろえたとき、会計ソフト向けの表から減る行数 */
  csvRowDelta: number;
  /** 人が読む1行 */
  summary: string;
  note: string;
};

/** YYYY-MM-DD の形をしているか */
function isYmd(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * 「表には出るのに金庫からは引かない」返金の行を数える。
 *
 * 数え方は会計ソフト向けの表（buildJournalRows）の返金の行とまったく同じ条件にし、
 * そこに「返した日が数え始めの日より前」を足したものです。
 * ＝ ここが0件なら、両方の決まりをそろえても表の行数は1行も変わりません。
 */
export function countAdvanceReturnGap(params: {
  ym: string;
  openingDate: string;
  advances: KeiriAdvance[];
}): { rows: number; csvRowDelta: number } {
  const opening = String(params.openingDate ?? "").trim();
  if (!isYmd(opening)) return { rows: 0, csvRowDelta: 0 };
  let rows = 0;
  let csvRowDelta = 0;
  for (const a of params.advances ?? []) {
    // 表は「月の経費に数えない」と理由が付いた行を作らないので、ここでも数えない
    if (a.skipReason) continue;
    if (a.settled !== true) continue;
    // 表は「返した日が無ければ立て替えた日」で並べるので、同じ見方をする
    const back = String(a.settledDate || a.date || "");
    if (!back.startsWith(params.ym)) continue;
    if (back >= opening) continue;
    rows += 1;
    // 表は金額0円の行を作らないので、減る行数は0円でないものだけ
    if ((Number(a.amount) || 0) !== 0) csvRowDelta += 1;
  }
  return { rows, csvRowDelta };
}

/** 外から読む形にする */
export function advanceReturnGapWindow(params: {
  ym: string;
  openingDate: string;
  advances: KeiriAdvance[];
  readable: boolean;
}): AdvanceReturnGapWindow {
  const opening = String(params.openingDate ?? "").trim();
  if (!params.readable) {
    return {
      readable: false,
      differs: false,
      openingDate: opening,
      rows: 0,
      csvRowDelta: 0,
      summary: "立替の棚が読めなかったので数えていません（0行と取り違えないこと）。",
      note: GAP_NOTE,
    };
  }
  const counted = countAdvanceReturnGap({
    ym: params.ym,
    openingDate: opening,
    advances: params.advances,
  });
  return {
    readable: true,
    differs: counted.rows > 0,
    openingDate: opening,
    rows: counted.rows,
    csvRowDelta: counted.csvRowDelta,
    summary:
      counted.rows > 0
        ? `数え始めの日（${opening}）より前に返した立替が ${counted.rows} 行あります。` +
          `この行は会計ソフト向けの表には出ますが、金庫からは引いていません。` +
          `金庫の決まりにそろえると、表の行数が ${counted.csvRowDelta} 行 減ります。`
        : `この月は食い違いがありません（数え始めの日より前に返した立替が0行）。` +
          `会計ソフト向けの表と金庫の数え方は、同じ返金を見ています。`,
    note: GAP_NOTE,
  };
}

const GAP_NOTE =
  "金額は1円も返していません（行数と、そろえたときに表から減る行数だけ）。";
