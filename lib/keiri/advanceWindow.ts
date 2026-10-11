/**
 * 「立替をどの期間ぶん読むかで、何行ふえて・何が動くか」を数えるところ
 * （2026-10-11・kp250・f1-2／f1-4）。**計算だけ**（倉庫は触りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   立替（だれかが自分のお金で先に払った経費）を読む期間は、2通りありました。
 *     ① ふだんの経理の画面 … 数え始めの日（月初のほうが早ければ月初）から今日まで
 *     ② その月だけ見る使い方 … 月の前後40日ずつ余白をつけて読む
 *   10/11 に読み方を1本（①）に寄せたところ、会計ソフト向けの表が
 *   **133行から124行に減りました**（9行）。減った行が何者なのかを
 *   **外から読むだけで確かめられる**ようにするのが、このファイルです。
 *
 * ■ 返すのは「件数」と「差（引き算の答え）」だけ
 *   立替の金額そのもの・お店の名前・払った人の名前は1文字も返しません
 *   （lib/keiri/checkWindow.ts の決まり③を守るため）。
 *   どの月に立て替えた行が何件あるか、そのうち何件がこの月に返されているか、
 *   そして入れたら経費・利益・現金・表の行数が**いくら動くか**だけを出します。
 *
 * ■ ここは通信をしません。だから検算（tests/keiriAdvanceWindow.test.ts）で固定できます。
 */

import type { KeiriAdvance } from "./types";

/** 立替1行を見分けるための合言葉（入り口＋番号。番号が無い行は日付・金額・説明で見分ける） */
export function advanceKey(a: KeiriAdvance): string {
  const id = a.id === null || a.id === undefined || a.id === "" ? null : String(a.id);
  if (id) return `${a.source ?? "?"}#${id}`;
  return `${a.source ?? "?"}@${a.date}/${Math.round(Number(a.amount) || 0)}/${(a.description ?? "").slice(0, 40)}`;
}

/** 片方にしか無い立替の、月ごとの件数 */
export type AdvanceMonthCount = {
  /** 立て替えた日の月（YYYY-MM） */
  ym: string;
  /** 件数 */
  count: number;
};

export type AdvanceOnlySide = {
  /** 片方にしか無い行の件数 */
  count: number;
  /** 立て替えた日の月ごとの件数（新しい月から） */
  byMonth: AdvanceMonthCount[];
  /** そのうち「見ている月に返した（精算した）」行の件数 */
  repaidInMonth: number;
  /** そのうち「返した日が入っている」行の件数（月は問わない） */
  settled: number;
  /** そのうち「まだ返していない」行の件数 */
  unsettled: number;
};

export type AdvanceWindowReport = {
  /** 見ている月 */
  ym: string;
  /** ふだんの画面の期間だけにある行 */
  onlyInScreen: AdvanceOnlySide;
  /** 前後40日の期間だけにある行 */
  onlyInWide: AdvanceOnlySide;
  /** 2つの期間が同じ行を読んでいるか */
  same: boolean;
  /** 人が読む1行 */
  summary: string;
};

/** 片方にしか無い行を数える */
function sideOf(ym: string, rows: KeiriAdvance[]): AdvanceOnlySide {
  const byMonth = new Map<string, number>();
  let repaidInMonth = 0;
  let settled = 0;
  for (const a of rows) {
    const m = String(a.date ?? "").slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
    const back = String(a.settledDate ?? "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(back)) {
      settled += 1;
      if (back.startsWith(ym)) repaidInMonth += 1;
    }
  }
  return {
    count: rows.length,
    byMonth: [...byMonth.entries()]
      .map(([m, count]) => ({ ym: m, count }))
      .sort((a, b) => (a.ym < b.ym ? 1 : a.ym > b.ym ? -1 : 0)),
    repaidInMonth,
    settled,
    unsettled: rows.length - settled,
  };
}

/**
 * 2つの期間が読んだ立替を見比べて、片方にしか無い行の中身を数える。
 *
 * @param ym      見ている月（YYYY-MM）
 * @param screen  ふだんの経理の画面が読んだ立替
 * @param wide    前後40日の期間で読んだ立替
 */
export function describeAdvanceWindow(params: {
  ym: string;
  screen: KeiriAdvance[];
  wide: KeiriAdvance[];
}): AdvanceWindowReport {
  const { ym } = params;
  const screenKeys = new Set(params.screen.map(advanceKey));
  const wideKeys = new Set(params.wide.map(advanceKey));
  const onlyScreenRows = params.screen.filter((a) => !wideKeys.has(advanceKey(a)));
  const onlyWideRows = params.wide.filter((a) => !screenKeys.has(advanceKey(a)));

  const onlyInScreen = sideOf(ym, onlyScreenRows);
  const onlyInWide = sideOf(ym, onlyWideRows);
  const same = onlyInScreen.count === 0 && onlyInWide.count === 0;

  return {
    ym,
    onlyInScreen,
    onlyInWide,
    same,
    summary: same
      ? "2つの期間は、まったく同じ立替の行を読んでいます（ふえる行・へる行はありません）。"
      : `前後40日の期間だけにある立替が ${onlyInWide.count} 行` +
        `（うち ${onlyInWide.repaidInMonth} 行は ${ym} に返した分）、` +
        `ふだんの画面の期間だけにある立替が ${onlyInScreen.count} 行です。`,
  };
}
