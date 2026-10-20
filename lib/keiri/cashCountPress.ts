/**
 * 「じゅんが金庫を数えるとき、何回 押せば記録に残るか」を1か所に決める所
 * （2026-10-20・kp245・f1-4）。**計算だけ**（倉庫は触りません・金額は1円も出しません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   f1-4（計算上の現金と、実際の金庫が合うか）に残っているのは、じゅんの1分だけです。
 *   ところが、その1分は **押す回数が2回**でした。
 *     ① ［この金額で比べる］… 画面に答えが出る（**ここでは1行も残りません**）
 *     ② ［この結果を控えに残す］… ここで初めて記録に残る
 *   ②を押さないと、答えは見えても記録が1行も残らず、こちら側から
 *   「合っていたか」を読めません（＝合否を付けられません）。
 *   実際に 10/15 まで、頼み文に②が書いてありませんでした。
 *   **押し忘れが1回あるだけで、1分がまるごと無駄になる形**でした。
 *
 * ■ どうするか
 *   置き場（keiri_cash_events）がまだ無いあいだ＝**控え**に残す道では、
 *   ①の1押しで②まで済ませます。控えは「いちばん新しい1回だけ」を
 *   書き換える形なので、**何回 押しても行は増えません**（＝1押しにしても安全）。
 *   置き場ができたあとの道（棚に1行ずつ足す）は、押すたびに行が増えるので
 *   **今までどおり2回**のままにします。
 *
 * ■ 守ること
 *   ・金額は作らない・直さない。入れた金額をそのまま控えるだけ。
 *   ・残せなかったときに「残しました」と言わない（lib/keiri/keiriSettingsWrite.ts の決まり）。
 *   ・手羽屋の日報・シフト・レジ・LINE・お金の計算（lib/money.ts）には触らない。
 */

import type { NoteKeepPlan } from "./cashCountMemo";

/** 数えた1回を、どこに残す道か */
export type CashCountPath =
  /** 置き場（keiri_cash_events）に1行 足す道。押すたびに行が増える */
  | "棚"
  /** 置き場がまだ無いあいだ、経理の設定のおまけ欄に1件だけ控える道 */
  | "控え";

/** いまどちらの道か（置き場があるかだけで決まる） */
export function cashCountPathOf(shelfMissing: boolean): CashCountPath {
  return shelfMissing ? "控え" : "棚";
}

/**
 * ［この金額で比べる］の1押しで、記録まで残すか。
 *
 * ★控えの道だけ true。棚の道は押すたびに行が増えるので false（今までどおり2回）。
 */
export function compareAlsoKeeps(shelfMissing: boolean): boolean {
  return cashCountPathOf(shelfMissing) === "控え";
}

/** じゅんが押す回数（比べる＋残す） */
export function pressesNeeded(shelfMissing: boolean): number {
  return compareAlsoKeeps(shelfMissing) ? 1 : 2;
}

/** 比べたあと、画面に出す1行（残ったか・まだ残っていないか） */
export function compareResultLine(params: {
  shelfMissing: boolean;
  kept: boolean;
}): string {
  const { shelfMissing, kept } = params;
  if (kept) {
    return (
      "この結果は控えに残しました（これで終わりです）。" +
      "残すのは「いちばん新しい1回だけ」なので、もう一度 比べても行は増えません。"
    );
  }
  const button = shelfMissing ? "この結果を控えに残す" : "この結果を記録する";
  return (
    "ここまでは記録に残していません（倉庫に1行も書いていません）。" +
    `下の［${button}］をもう1回 押すと残ります。`
  );
}

/** 残す所の押しボタンに出す言葉 */
export function keepButtonLabel(params: {
  shelfMissing: boolean;
  compared: boolean;
  kept: boolean;
  saving: boolean;
}): string {
  const { shelfMissing, compared, kept, saving } = params;
  if (saving) return shelfMissing ? "控えています…" : "保存中…";
  const what = shelfMissing ? "控えに残す" : "記録する";
  if (kept) return `もう一度 ${what}（押さなくても残っています）`;
  if (compared) return `あと1回：この結果を${what}（これで終わりです）`;
  return `この結果を${what}`;
}

/**
 * 「いま じゅんが押したら、ちゃんと記録に残るか」を**外から読める形**に畳む
 * （金額は1円も出しません・1行も書き込みません）。
 *
 * ■ なぜ外に出すのか
 *   控えの道は、先に「経理の設定の行」を読んでから足します。
 *   その読みが行を1つも返さないと、そこで止まる作りです（2026-10-20・PR #270）。
 *   ＝ **行が読めるかどうかが、じゅんの1分が実るかどうか**です。
 *   頼む前に、こちら側から確かめられるようにします。
 *
 * @param shelfMissing   置き場（keiri_cash_events）がまだ無いか
 * @param rowReadable    経理の設定の行が、**公開の鍵**（画面と同じ鍵）で読めたか
 * @param readError      その読みが返したエラーの文（無ければ null）
 */
export type CashCountPress = {
  path: CashCountPath;
  /** じゅんが押す回数 */
  presses: number;
  /** いま押したら記録が残るか（null＝こちらでは確かめていない） */
  willKeep: boolean | null;
  /** 残らないときの理由（残るときは null） */
  reason: string | null;
  /** 人が読む1行 */
  line: string;
  /**
   * いま おまけ欄に書いてある ひとこと（人が書いた文）が、控えを足しても残るか
   * （null＝控えの道ではない／確かめていない）。**文そのものは返しません**
   */
  existingNote: NoteKeepPlan | null;
  /** この窓口が何を返さないか */
  note: string;
};

const PRESS_NOTE =
  "金額は1円も返しません。返すのは「押す回数」と「いま押したら残るか」、" +
  "そして「いま書いてある ひとこと が残るか（文字数だけ・文そのものは返しません）」です。1行も書き込みません。";

export function buildCashCountPress(params: {
  shelfMissing: boolean;
  rowReadable: boolean;
  readError: string | null;
  /** いま書いてある ひとこと が残るか（読めなかったときは null） */
  existingNote?: NoteKeepPlan | null;
}): CashCountPress {
  const { shelfMissing, rowReadable, readError } = params;
  const existingNote = params.existingNote ?? null;
  const path = cashCountPathOf(shelfMissing);
  const presses = pressesNeeded(shelfMissing);

  if (path === "棚") {
    return {
      path,
      presses,
      willKeep: null,
      reason: null,
      line:
        "置き場（keiri_cash_events）ができています。数えた1回は棚に1行ずつ足す道で残ります" +
        `（押すのは ${presses} 回：比べる → 記録する）。この道は外から確かめていません。`,
      existingNote: null,
      note: PRESS_NOTE,
    };
  }

  if (readError) {
    return {
      path,
      presses,
      willKeep: false,
      reason: `経理の設定の行を、公開の鍵で読めませんでした：${readError.slice(0, 120)}`,
      line:
        "いま押しても記録が残りません（控えを置く場所＝経理の設定の行が、画面と同じ鍵で読めません）。" +
        "金庫を数えてもらう前に、ここを直すこと。",
      existingNote: null,
      note: PRESS_NOTE,
    };
  }

  if (!rowReadable) {
    return {
      path,
      presses,
      willKeep: false,
      reason: "経理の設定の行が1つも返りませんでした（控えを置く場所が分かりません）",
      line:
        "いま押しても記録が残りません（控えを置く場所＝経理の設定の行が1つも読めません）。" +
        "金庫を数えてもらう前に、ここを直すこと。",
      existingNote: null,
      note: PRESS_NOTE,
    };
  }

  return {
    path,
    presses,
    willKeep: true,
    reason: null,
    line:
      `用意はできています。押すのは ${presses} 回だけです` +
      "（［この金額で比べる］を押すと、答えが出て、そのまま控えに残ります）。" +
      "置き場（keiri_cash_events）はまだ無いので、経理の設定のおまけ欄に" +
      "「いちばん新しい1回だけ」を控えます。貼り紙は待ちません。" +
      (existingNote ? `${existingNote.line}` : ""),
    existingNote,
    note: PRESS_NOTE,
  };
}
