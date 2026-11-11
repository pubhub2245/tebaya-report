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
  /**
   * そのうち「**経理の数え始めの日より前**に立て替えた」行の件数
   * （2026-11-11・f1-4。数え始めの日が分からないときは null）。
   *
   * ★ここが大事です。数え始めの日より前に立て替えた分は、
   *   **いまの画面に足してはいけません**。数え始めの残高は「その日に金庫にあった実際のお金」
   *   なので、その日までに出入りしたお金はもう中に入っています
   *   （lib/keiri/cashOpeningGap.ts と同じ考え方）。
   */
  beforeOpening: number | null;
  /**
   * そのうち「数え始めの日より前に立て替えて、数え始めの日以後に返した」行の件数
   * （2026-11-11・f1-4）。
   *
   * ★この行は**金庫の窓口がもう受け持っています**
   *   （lib/keiri/advanceRange.ts の advanceRepaidEarlierRange が別の入れ物で読み、
   *   「前の月に立て替えて今月 返した分も引く数え方」として比べる相手に並べます）。
   *   ＝ **ここの件数は、金庫を数える日の食い違いの元になりません。**
   */
  repaidAfterOpening: number | null;
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
  /**
   * 「広い期間だけにある行を足したら、現金が◯円 ずれる」をどう読むか（2026-11-11・f1-4）。
   *
   * ★なぜ要るか：2026-11-11 に「8行を入れると現金が 449,350円 ずれる」という読みから
   *   『金庫を数える日の食い違いの元になりえる』という報告が立ちました。
   *   実際には その8行は**ぜんぶ数え始めの日より前**に立て替えた行で、
   *   足してはいけない行です（足したら二重に引きます）。返した日が数え始めの日より
   *   後にある行は、金庫の窓口が別の数え方としてもう並べています。
   *   窓口が差の数字だけを出して、その読み方を書いていなかったので、
   *   同じ報告が何度でも立ちます。ここに1行で書いておきます。
   */
  wideOnlyMeans: string;
};

/** その文字列が YYYY-MM-DD の形をしているか */
function isYmd(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** 片方にしか無い行を数える */
function sideOf(ym: string, rows: KeiriAdvance[], openingDate?: string | null): AdvanceOnlySide {
  const byMonth = new Map<string, number>();
  let repaidInMonth = 0;
  let settled = 0;
  const opening = isYmd(String(openingDate ?? "").slice(0, 10))
    ? String(openingDate).slice(0, 10)
    : null;
  let beforeOpening = 0;
  let repaidAfterOpening = 0;
  for (const a of rows) {
    const d = String(a.date ?? "").slice(0, 10);
    const m = d.slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
    const back = String(a.settledDate ?? "").slice(0, 10);
    const hasBack = isYmd(back);
    if (hasBack) {
      settled += 1;
      if (back.startsWith(ym)) repaidInMonth += 1;
    }
    // 数え始めの日より前に立て替えた行か（足してはいけない行）
    if (opening && isYmd(d) && d < opening) {
      beforeOpening += 1;
      // そのうち、返したのが数え始めの日以後＝金庫の窓口がもう受け持っている行
      if (hasBack && back >= opening) repaidAfterOpening += 1;
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
    beforeOpening: opening ? beforeOpening : null,
    repaidAfterOpening: opening ? repaidAfterOpening : null,
  };
}

/** 「広い期間だけにある行」の読み方を1行にする（金額は入れない） */
function wideOnlyMeansOf(side: AdvanceOnlySide, opening: string | null): string {
  if (side.count === 0) {
    return "広い期間だけにある立替はありません（足す／足さないを決める行がありません）。";
  }
  if (!opening) {
    return (
      `広い期間だけにある立替が ${side.count} 行ありますが、` +
      "経理の数え始めの日が読めていないので、足してよい行かどうかを言えません" +
      "（いまの画面の金額は動かしていません）。"
    );
  }
  const head =
    `下の diffIfIncluded は「もし足したら いくら動くか」という**仮の計算**です。` +
    `**足していません。足してもいけません。**`;
  if (side.beforeOpening === side.count) {
    return (
      `${head} 広い期間だけにある ${side.count} 行は**ぜんぶ 数え始めの日（${opening}）より前**に` +
      "立て替えた行です。数え始めの残高は「その日に金庫にあった実際のお金」なので、" +
      "その日より前のお金はもう中に入っています＝足すと二重に引きます。" +
      (side.repaidAfterOpening && side.repaidAfterOpening > 0
        ? `そのうち ${side.repaidAfterOpening} 行は 返したのが数え始めの日以後なので、` +
          "**金庫の窓口（/api/keiri/cashcount）が「前の月に立て替えて今月 返した分も引く数え方」" +
          "として もう比べる相手に並べています**＝金庫を数える日の食い違いの元になりません。"
        : "返した日が数え始めの日以後の行は1行もないので、金庫からお金は出ていません" +
          "＝金庫を数える日の食い違いの元になりません。")
    );
  }
  return (
    `${head} 広い期間だけにある ${side.count} 行のうち ${side.beforeOpening ?? 0} 行は` +
    `数え始めの日（${opening}）より前に立て替えた行で、足すと二重に引きます` +
    `（うち ${side.repaidAfterOpening ?? 0} 行は 金庫の窓口が別の数え方としてもう並べています）。` +
    `のこり ${side.count - (side.beforeOpening ?? 0)} 行は数え始めの日以後の行なので、` +
    "足すかどうかは kp250 で決めます。"
  );
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
  /** 経理の数え始めの日（YYYY-MM-DD）。渡さなければ「足してよいか」は言わない */
  openingDate?: string | null;
}): AdvanceWindowReport {
  const { ym } = params;
  const opening = /^\d{4}-\d{2}-\d{2}$/.test(String(params.openingDate ?? "").slice(0, 10))
    ? String(params.openingDate).slice(0, 10)
    : null;
  const screenKeys = new Set(params.screen.map(advanceKey));
  const wideKeys = new Set(params.wide.map(advanceKey));
  const onlyScreenRows = params.screen.filter((a) => !wideKeys.has(advanceKey(a)));
  const onlyWideRows = params.wide.filter((a) => !screenKeys.has(advanceKey(a)));

  const onlyInScreen = sideOf(ym, onlyScreenRows, opening);
  const onlyInWide = sideOf(ym, onlyWideRows, opening);
  const same = onlyInScreen.count === 0 && onlyInWide.count === 0;

  return {
    ym,
    onlyInScreen,
    onlyInWide,
    same,
    wideOnlyMeans: wideOnlyMeansOf(onlyInWide, opening),
    summary: same
      ? "2つの期間は、まったく同じ立替の行を読んでいます（ふえる行・へる行はありません）。"
      : `前後40日の期間だけにある立替が ${onlyInWide.count} 行` +
        `（うち ${onlyInWide.repaidInMonth} 行は ${ym} に返した分）、` +
        `ふだんの画面の期間だけにある立替が ${onlyInScreen.count} 行です。`,
  };
}
