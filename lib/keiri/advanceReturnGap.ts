/**
 * 「数え始めの日より前に返した立替」が何件あるかを数えるところ
 * （2026-10-16・kp254・f1-7／f1-4）。**計算だけ**（倉庫は触りません）。
 *
 * ■ これは「誤り」ではありません（検査役 B2 の材料 keiri-material-kp254-hyo-kinko のとおり）
 *   立替（だれかが自分のお金で先に払った経費）を返すと、その日に金庫からお金が出ます。
 *   同じ1件を、2か所がちがう決まりで見ています。**どちらも正しい**です。
 *     ・**会計ソフト向けの表**（lib/keiri/journal.ts）… 「その月に起きたこと」の帳簿。
 *       9/05 に返したなら、9月に本当に起きたお金の動き（未払金が減る／現金が出る）なので**残す**
 *     ・**金庫の数え方**（lib/keiri/aggregate.ts）… 「数え始めの日に数えた金庫の金額」から始める。
 *       9/05 の返金はその金額にもう入っているので**引かない**
 *   ＝ 2つの差は、**数え始めの日より前の動きそのもの**です。
 *   **表から本物の返金の行を消してそろえてはいけません**（消すと会計ソフトのほうで
 *   未払金が残ったまま・現金が多いままになり、店主か税理士が後で手で直すことになります）。
 *
 * ■ では何のために数えるのか
 *   1件でもあれば、**金庫の画面にひとこと出す必要がある**ためです
 *   （「数え始めの日より前にお返しした立替は、数えた金庫にもう入っているので引いていません」）。
 *   0件なら、その説明は要りません。手羽屋は 2026-07／08／09／10 の4か月すべて0件でした
 *   （本番で実測・2026-10-16）。
 *
 * ■ 金額は返しません
 *   件数と、表と金庫でちがって見える行数だけです（lib/keiri/checkWindow.ts の決まり③）。
 */

import type { KeiriAdvance } from "./types";

/** 外から読む形。金額は1円も入れない */
export type AdvanceReturnGapWindow = {
  /** 立替の棚が読めたか（読めていないのに0件と取り違えないため） */
  readable: boolean;
  /** 表と金庫でちがって見える行があるか（1行でもあれば true。誤りではない） */
  differs: boolean;
  /** 数え始めの日（YYYY-MM-DD）。空なら決まっていない */
  openingDate: string;
  /** 返した日がその月で、かつ数え始めの日より前の立替の行数 */
  rows: number;
  /** そのうち会計ソフト向けの表に行が出る数（金額0円の行は表に出ない） */
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
 * 「表には出るが、金庫からは引かない」返金の行を数える。
 *
 * 数え方は会計ソフト向けの表（buildJournalRows）の返金の行とまったく同じ条件にし、
 * そこに「返した日が数え始めの日より前」を足したものです。
 * ＝ ここが0件なら、金庫の画面にひとこと添える必要はありません。
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
        ? `数え始めの日（${opening}）より前に返した立替が ${counted.rows} 行あります` +
          `（会計ソフト向けの表に出るのは ${counted.csvRowDelta} 行）。` +
          `この行は表には残り（その月に本当に起きた動きなので）、金庫からは引きません` +
          `（数えた金庫の金額にもう入っているので）。どちらも正しいので、行を消してそろえないこと。` +
          `金庫の画面に「数え始めの日より前にお返しした立替は引いていません」の1行が必要です。`
        : `この月は、表と金庫でちがって見える行がありません` +
          `（数え始めの日より前に返した立替が0行）。金庫の画面に添える説明も要りません。`,
    note: GAP_NOTE,
  };
}

const GAP_NOTE =
  "金額は1円も返していません（行数と、表に出る行数だけ）。" +
  "表と金庫でちがって見えるのは誤りではなく「数え始めの日より前の動き」です（行を消してそろえない）。";
