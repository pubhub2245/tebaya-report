/**
 * 「じゅんにしかできない、一度きりの手続き」が いま何件のこっているか（kp247）。
 *
 * ■ なぜ要るのか（2026-10-10・B）
 *   仕上げチェック表の のこり3項目（f1-4・f3-4・f5-4）と、
 *   棚待ちの2項目（f1-5・f1-6）は、**どれも じゅんの一度きりの手続き待ち**です。
 *   手続きそのものは1〜2分なのですが、入口が
 *     ・/keiri        … 金庫を数えて金額を入れる
 *     ・/keiri/sql    … 倉庫に貼り紙を1回 貼る
 *     ・/keiri/key    … サーバー側の鍵を貼り直す
 *   と **3か所に散っていて、どこからも互いにリンクしていませんでした**
 *   （2026-10-10 に数えて確認。/keiri を開いても、のこり2つは画面に出ません）。
 *   そのため お願いは1日3回 司令室に積まれる一方で、
 *   じゅんが開く画面には **1件も出ていない**状態が7日 続きました。
 *
 *   そこで「のこりの手続き」を1か所にまとめ、
 *   じゅんがふだん開く経理の画面（/keiri）のいちばん上に出します。
 *   ＝ **1画面 開けば、のこり全部が見えて、それぞれ1タップで行ける。**
 *
 * ■ ここは計算だけ（通信もブラウザも要りません）
 *   倉庫を読むのは窓口（app/api/keiri/setuptodo/route.ts）の仕事で、
 *   「どれが のこっているか・どう並べるか」はこのファイル1つに書きます。
 *   tests/keiriSetupTodo.test.ts で固定してあります。
 *
 * ■ 守ること
 *   ・鍵・合言葉・金額の中身は1文字も持たない（出すのは「済み／のこり」だけ）
 *   ・分からないときは「済み」に寄せない（**安全側＝のこり扱い**にはせず
 *     「分からない」とそのまま言う。嘘の合格を作らないため）
 *   ・手羽屋の日報・シフト・レジ・LINE・お金の計算とは関係しない
 */

import { compareAlsoKeeps } from "./cashCountPress";

/** その手続きが済んでいるか */
export type SetupTodoState = "のこり" | "済み" | "分からない";

export type SetupTodoId = "shelves" | "cash" | "key" | "photo";

export type SetupTodoItem = {
  id: SetupTodoId;
  /** 並び順（小さいほど先にやってほしい） */
  order: number;
  /** 何をするか（じゅんが読む1行） */
  title: string;
  /** かかる時間 */
  minutes: string;
  /** 済むと何が前に進むか */
  benefit: string;
  /** その1枚 */
  href: string;
  state: SetupTodoState;
  /** 仕上げチェック表のどの項目につながるか */
  checks: string[];
  /** いまの状態を1行で（数字は「何本／何本」だけ。中身は出さない） */
  detail: string;
  /**
   * 画面で「押すボタン」を順番どおりに並べたもの（2026-10-15・f1-4）。
   *
   * ■ なぜ要るのか
   *   金庫の1分は、画面で **2回 押して初めて記録に残ります**
   *   （［この金額で比べる］→［この結果を控えに残す］）。
   *   お願いの文が1回目で終わっていたため、押しても記録が残らず、
   *   こちら側から「合っていた」を確かめられない道が残っていました。
   *   押すものを全部ここに書き、画面にもそのまま出します。
   */
  presses?: string[];
};

export type SetupTodo = {
  items: SetupTodoItem[];
  /** のこっている件数（「分からない」は数えない） */
  remaining: number;
  /** 確かめられなかった件数 */
  unknown: number;
  allDone: boolean;
  /** 1行のまとめ */
  summary: string;
  /**
   * 倉庫（データのしまい場所）から返事が来ていないときの1行（2026-11-07・f1-4）。
   *
   * ■ なぜ要るのか
   *   倉庫が眠っている日は、貼り紙と金庫の1分は**押しても答えが出ません**。
   *   ところがこの一覧は「のこり2件・3分ほど」とだけ出していたので、
   *   じゅんが開くと**いま押せるように見えます**（押した1分は何も残りません）。
   *   いまでもできるのは［サーバー側の鍵を貼り直す］だけなので、そこまで書きます。
   *   答えが来ていないかどうかは、2つの別々の読み（貼り紙の13本・金庫の記録）が
   *   **両方とも**答えなかったときだけ言います（1つだけなら、その棚の都合かもしれないため）。
   */
  warehouseNote: string | null;
  /**
   * 「3つは互いに待っていない」ことを1行で（2026-10-15・f1-4）。
   *
   * のこりが2件以上のときだけ出す。順番に見えると
   * 「上が済むまで下は押しても意味が無い」と読まれ、1分で済む手続きが
   * 2分の手続きを待つことになる（実際に 2026-10-15 にそう読まれた）。
   */
  independentNote: string | null;
  /**
   * 『よその店のデータが見えないか』（f3-4）は、1つ押しただけでは閉まらない（2026-11-09・f3-4）。
   *
   * ■ なぜ要るのか
   *   この一覧の［サーバー側の鍵を貼り直す］と［レシート写真の置き場を閉める］は、
   *   どちらも「**仕上げの不合格はこれで閉まります**」と書いていました。
   *   ところが f3-4 を閉めるには、**倉庫の貼り紙（棚の鍵）・サーバー側の鍵・
   *   写真の置き場**の3つがそろう必要があります（貼り紙を流すまで、ブラウザから
   *   倉庫を直に読む道は開いたままです／窓口も remaining でそう答えています）。
   *   ＝ じゅんが1つ押して「閉まった」と受け取る形でした。**何がのこっているかを数えて言います。**
   */
  f34Note: string | null;
};

/** 窓口が倉庫を読んで分かったこと。読めなければ null（＝分からない） */
export type SetupTodoInput = {
  /**
   * 貼り紙が何本 流れたか。
   * unknown＝**確かめられなかった本数**（2026-11-07 追加）。
   * これを渡さないと「確かめられなかった」が「まだ流れていない（のこり）」に
   * 混ざり、倉庫が眠っている日に『のこり 9 本』と**数えたふり**をしてしまいます。
   */
  shelves: { done: number; total: number; unknown?: number } | null;
  /**
   * いま、よその店の行が公開の鍵で何行 読めているか（2026-11-13・f3-4）。
   *
   * ■ なぜ要るのか
   *   貼り紙のお願いは「5つが一度に前に進みます」という **これから** の話だけで、
   *   **いま漏れている**という今の話がどこにもありませんでした（この事実は
   *   /api/keiri/copies にしか出ていませんでした）。渡さなければ今までどおり
   *   1文字も増えません。決まりは lib/keiri/shelfLeak.ts の1か所です。
   */
  leak?: { rows: number; line: string | null } | null;
  /** サーバー側の鍵 */
  key: { configured: boolean; usable: boolean } | null;
  /**
   * 金庫を数えた記録。
   * shelfMissing＝記録を置く棚（貼り紙①）がまだ無い。
   * counted＝数えた記録が1行でもあるか。
   */
  cash: {
    shelfMissing: boolean;
    counted: boolean;
    countedInMemo?: boolean;
    /**
     * 「日報が入っていない日は お休みでしたか」が、まだ答えられていないか
     * （2026-11-14・f1-4）。残っているあいだは、押すボタンが1つ増えます
     * （答えないと、数えても合否が出ないため）。渡さなければ今までどおり。
     */
    gapQuestionOpen?: boolean;
    /** その日数（言い方に入れるだけ） */
    gapQuestionDays?: number;
  } | null;
  /**
   * レシート写真の置き場（2026-10-28・f3-4）。
   *
   * ■ なぜ要るのか
   *   仕上げで唯一の「不合格」＝f3-4（よその店のデータが見えないか）に残っているのは
   *   **置き場が「公開」のまま**という1点だけです。閉めるのは /keiri/key の下にある
   *   **1タップ**で、鍵を貼り直したあとに押します。
   *   ところが この一覧は「鍵を貼り直す」が済むと その行を消すので、
   *   **最後の1タップが、じゅんが見る唯一の一覧から消えてしまう**形でした。
   *   ＝ 鍵を直しても f3-4 は閉まらず、次の回にもう一度お願いすることになります。
   *   そこで「置き場を閉める」を1件として立て、**閉まるまで消えない**ようにします。
   *
   * bucketPublic … true=公開のまま / false=非公開（済み） / null=確かめられない
   * keyUsable  … サーバー側の鍵がそのまま使えるか（使えないあいだは押せません）
   *
   * ※ この欄が無い（undefined）ときは、この1件を出しません（古い呼び出しのため）。
   */
  photo?: { bucketPublic: boolean | null; keyUsable: boolean } | null;
};

const SQL_SHEET = "/keiri/sql";
const KEY_SHEET = "/keiri/key";
const CASH_SHEET = "/keiri";

function shelvesItem(
  input: SetupTodoInput["shelves"],
  leak?: SetupTodoInput["leak"],
): SetupTodoItem {
  /**
   * ★漏れている行があるときだけ、今の状態のうしろに足します（2026-11-13・f3-4）。
   *   「済み」の行には足しません（流れたあとに漏れが残っていたら、それは
   *   貼り紙の話ではなく別の引っかかりなので、窓口 /api/keiri/copies で見ます）。
   */
  const leakTail = leak && leak.rows > 0 && leak.line ? `。${leak.line}` : "";
  const base = {
    id: "shelves" as const,
    // ★2026-10-20：金庫（1分・1押し）を先にした（下の cashItem の覚え書き）。
    order: 2,
    title: "倉庫に貼り紙を1回 貼る",
    minutes: "2分",
    benefit:
      "金庫の突き合わせ・同じ支払いの片付け・レシート写真の読み取り・" +
      "お店ごとの分け方・テストのお店1軒——5つが一度に前に進みます",
    href: SQL_SHEET,
    checks: ["f1-4", "f1-5", "f1-6", "f3-4", "f5-4"],
  };
  if (!input) {
    return { ...base, state: "分からない", detail: "いま確かめられませんでした" };
  }
  if (input.total > 0 && input.done >= input.total) {
    return { ...base, state: "済み", detail: `${input.done}／${input.total} が流れています` };
  }
  const unknown = Math.max(0, Math.min(input.unknown ?? 0, input.total));
  // 1本も確かめられなかった＝**数えていない**。「のこり◯本」と言わない（2026-11-07・f3-4）
  if (input.total > 0 && unknown >= input.total) {
    return {
      ...base,
      state: "分からない",
      detail:
        `${input.total} 本ぜんぶ、いま確かめられませんでした（倉庫から返事が来ていません）` +
        leakTail,
    };
  }
  const left = Math.max(0, input.total - input.done - unknown);
  return {
    ...base,
    state: "のこり",
    detail:
      `${input.done}／${input.total} が流れています（のこり ${left} 本` +
      (unknown > 0 ? `・ほかに ${unknown} 本は確かめられませんでした` : "") +
      "）" +
      leakTail,
  };
}

function cashItem(input: SetupTodoInput["cash"]): SetupTodoItem {
  const base = {
    id: "cash" as const,
    /**
     * ★2026-10-20：いちばん上に出す（kp245・f1-4）。
     *   いまは **1分・押すのは1回**で、ほかの手続きを1つも待ちません。
     *   貼り紙（2分）が17日 動いていないあいだ、その後ろに置いていると
     *   「上が済むまで押しても意味が無い」と読まれます。短いほうを先に出します。
     */
    order: 1,
    title: "金庫を数えて、金額を1回 入れる",
    minutes: "1分",
    benefit: "「計算上の現金」と「実際の金庫」が合っているかが、その場で分かります",
    href: CASH_SHEET,
    checks: ["f1-4"],
    // ★押すボタンは、下で「控えの道か棚の道か」によって入れ替えます。
    //   控えの道（置き場がまだ無いあいだ）は、比べた1押しで控えまで残ります。
    presses: ["この金額で比べる", "この結果を控えに残す（これで終わりです）"],
  };
  /**
   * 押すボタンの並び。**決まりは lib/keiri/cashCountPress.ts の1か所**に合わせる。
   * ここだけ古いままだと、画面のボタンは1回なのに お願いの文は2回と書く食い違いになる。
   */
  const pressesFor = (shelfMissing: boolean): string[] => {
    const where = shelfMissing ? "控えに残ります" : "記録に残ります";
    const count = compareAlsoKeeps(shelfMissing)
      ? [`この金額で比べる（これで${where}。押すのはこの1回だけです）`]
      : ["この金額で比べる", "この結果を控えに残す（これで終わりです）"];
    // ★空きの答えは **えらぶだけ**（2026-11-14 夕・f1-4）。
    //   お昼までは答えも「押す」形で、押すのが2つになっていました。
    //   1つ 押して離れると、また「いまは言えません」で終わります。
    //   いまは ［この金額で比べる］の同じ1押しで、答えもいっしょに控えます。
    if (!gapOpen) return count;
    return [
      `（えらぶだけ・押しません）この${gapDays > 0 ? `${gapDays}日` : "空いている日"}は お休みでした` +
        "／営業した日があります",
      ...count,
    ];
  };
  if (!input) {
    return { ...base, state: "分からない", detail: "いま確かめられませんでした" };
  }
  const gapOpen = input.gapQuestionOpen === true;
  const gapDays = Math.max(0, Math.round(input.gapQuestionDays ?? 0));
  /**
   * 空きの答えがまだのときに足す1文（2026-11-14・f1-4）。
   * ★これが無いと「押すのは1回だけ」と書いたまま、押しても合否が出ません。
   */
  const gapLine = gapOpen
    ? `先に、日報が入っていない${gapDays > 0 ? ` ${gapDays}日` : "日"}が` +
      "「お休みでした」か「営業した日があります」かを **えらんで**ください" +
      "（出店の予定表は入力をやめているので、アプリの中からは分かりません）。" +
      "えらぶだけで、押すのは［この金額で比べる］の1回だけです" +
      "（答えも同じ1押しで控えます）。えらばないと、数えても答えは" +
      "「いまは言えません」になります。"
    : "";
  // ★棚がまだ無くても、数えた1回は控えに残ります（2026-10-13・f1-4）。
  //   「入れても残りません」と言い続けると、1分で済む手続きが2分の貼り紙を待ちます。
  if (input.counted) {
    return {
      ...base,
      presses: pressesFor(input.shelfMissing),
      state: "済み",
      detail: input.countedInMemo
        ? "数えた記録が控えに残っています（棚ができたら、そのまま記録に移ります）"
        : "数えた記録が残っています",
    };
  }
  if (input.shelfMissing) {
    return {
      ...base,
      presses: pressesFor(true),
      state: "のこり",
      detail:
        (gapLine ? `${gapLine}そのうえで、` : "") +
        "棚は準備中ですが、いま入れれば控えに残ります" +
        "（貼り紙を待ちません。押すのは［この金額で比べる］の1回だけで、" +
        "答えがその場に出て、そのまま控えに残ります）",
    };
  }
  return {
    ...base,
    presses: pressesFor(false),
    state: "のこり",
    detail:
      (gapLine ? `${gapLine}そのうえで、` : "") +
      "数えた記録がまだ1件もありません" +
      "（押すのは［この金額で比べる］の1回だけで、答えがその場に出て、" +
      "そのまま記録に残ります。同じ日・同じ金額は足さないので行は増えません）",
  };
}

function keyItem(input: SetupTodoInput["key"]): SetupTodoItem {
  const base = {
    id: "key" as const,
    order: 3,
    title: "サーバー側の鍵を貼り直す",
    minutes: "1分",
    /**
     * ★2026-10-28：ここが「毎日の控えが戻ります」だけになっていました（f3-4）。
     *   実際には、**仕上げで唯一の不合格（f3-4）を閉められるのはこの1分だけ**です
     *   （置き場を閉めると写真は期限つきの住所ごしに映り、それを作れるのは
     *   サーバー側の鍵だけ）。いちばん大事な効き目が じゅんの一覧に出ていないので、
     *   いちばん先に書きます。
     */
    benefit:
      "レシート写真の置き場を閉められるようになります" +
      "（住所を知っていても、合言葉なしでは開けない形）。" +
      "『よその店のデータが見えないか』を閉める3つ（倉庫の貼り紙・この鍵・写真の置き場）のうちの1つです。" +
      "あわせて毎日の自動の控え（バックアップ）も戻ります",
    href: KEY_SHEET,
    checks: ["f3-4"],
  };
  if (!input) {
    return { ...base, state: "分からない", detail: "いま確かめられませんでした" };
  }
  if (input.usable) {
    return { ...base, state: "済み", detail: "鍵は使える形です" };
  }
  return {
    ...base,
    state: "のこり",
    detail: input.configured
      ? "鍵の欄に、鍵ではないものが入っています"
      : "鍵がまだ入っていません",
  };
}

/**
 * レシート写真の置き場を閉める1タップ（2026-10-28・f3-4）。
 *
 * ★「分からない」ときに「済み」へ寄せない（嘘の合格を作らないため）。
 * ★鍵が使えないあいだも **のこり** のまま出す（置き場は本当に開いているので、
 *   「済み」や「分からない」にすると、閉まっていないのに一覧から消えます）。
 */
function photoItem(
  input: NonNullable<SetupTodoInput["photo"]> | null,
): SetupTodoItem {
  const base = {
    id: "photo" as const,
    order: 4,
    title: "レシート写真の置き場を閉める（1タップ）",
    // ★「秒」は分に足しません（totalMinutes / remainingMinutes で見ています）
    minutes: "10秒",
    benefit:
      "住所を知っていても、合言葉なしではレシート写真が開けなくなります。" +
      "『よその店のデータが見えないか』を閉める3つ（倉庫の貼り紙・サーバー側の鍵・この置き場）のうちの1つです",
    href: KEY_SHEET,
    checks: ["f3-4"],
  };
  if (!input) {
    return { ...base, state: "分からない", detail: "いま確かめられませんでした" };
  }
  if (input.bucketPublic === false) {
    return { ...base, state: "済み", detail: "置き場はもう非公開です" };
  }
  if (input.bucketPublic === null) {
    return {
      ...base,
      state: "分からない",
      detail: "置き場が公開かどうかを、いま確かめられませんでした",
    };
  }
  if (!input.keyUsable) {
    return {
      ...base,
      state: "のこり",
      detail:
        "置き場は公開のままです。先に［サーバー側の鍵を貼り直す］を済ませると、" +
        "同じ1枚（/keiri/key）の下に［レシート写真の置き場を閉める］のボタンが出ます",
    };
  }
  return {
    ...base,
    state: "のこり",
    presses: ["レシート写真の置き場を閉める（これで終わりです）"],
    detail:
      "いま押せます（置き場は公開のまま・鍵は使える形です）。" +
      "閉める前と後に写真が読めることを確かめ、読めなくなったらその場で元に戻します",
  };
}

/** 「のこり」を先に、同じなら order の小さい順 */
function sortItems(items: SetupTodoItem[]): SetupTodoItem[] {
  const rank = (s: SetupTodoState) => (s === "のこり" ? 0 : s === "分からない" ? 1 : 2);
  return [...items].sort((a, b) => rank(a.state) - rank(b.state) || a.order - b.order);
}

export function buildSetupTodo(input: SetupTodoInput): SetupTodo {
  const items = sortItems([
    shelvesItem(input.shelves, input.leak),
    cashItem(input.cash),
    keyItem(input.key),
    // ★この欄を渡していない呼び出し（古い試験など）では、この1件を出しません
    ...(input.photo === undefined ? [] : [photoItem(input.photo)]),
  ]);
  const remaining = items.filter((i) => i.state === "のこり").length;
  const unknown = items.filter((i) => i.state === "分からない").length;
  const allDone = remaining === 0 && unknown === 0;

  const summary = allDone
    ? "のこりの手続きはありません。じゅんが押すものは1つも無い状態です"
    : remaining === 0
      ? `のこりは0件ですが、${unknown} 件は確かめられませんでした`
      : `のこりの手続きは ${remaining} 件です（合わせて ${totalMinutes(items)}分ほど）` +
        (unknown > 0 ? `。ほかに ${unknown} 件は確かめられませんでした` : "");

  return {
    items,
    remaining,
    unknown,
    allDone,
    summary,
    warehouseNote: warehouseAnswering(input) === false ? WAREHOUSE_ASLEEP_NOTE : null,
    independentNote: remaining >= 2 ? INDEPENDENT_NOTE : null,
    f34Note: f34Note(items),
  };
}

/** f3-4 を閉めるのに要る手続きの id（この3つがそろって初めて閉まる） */
export const F34_ITEM_IDS: SetupTodoId[] = ["shelves", "key", "photo"];

/**
 * 『よその店のデータが見えないか』（f3-4）が、いま何つ待ちかを1行で言う。
 *
 * ★「済み」以外（のこり・分からない）は、**閉まっていない側**に数えます
 *   （分からないものを閉まった扱いにすると、嘘の合格を作ります）。
 * ★3つのうち1つも一覧に出ていない呼び出し（古い試験など）では null を返します。
 */
export function f34Note(items: SetupTodoItem[]): string | null {
  const own = items.filter((i) => F34_ITEM_IDS.includes(i.id));
  if (own.length === 0) return null;
  const left = own.filter((i) => i.state !== "済み");
  const head =
    "『よその店のデータが見えないか』は、倉庫の貼り紙・サーバー側の鍵・レシート写真の置き場の" +
    "3つがそろって初めて閉まります（1つ押しただけでは まだ閉まりません）。";
  if (left.length === 0) {
    return (
      head +
      "この3つはぜんぶ済んでいます。閉まったかどうかは、外から測り直してから付けます。"
    );
  }
  return head + `いまのこっているのは ${left.length} つです：${left.map((i) => i.title).join("／")}。`;
}

/**
 * 倉庫から返事が来ているか（**分からないときは null**）。
 *
 * ■ 決め方（2026-11-07・f1-4）
 *   別々の2つの読みを見ます：貼り紙の13本（棚を1つずつ聞く）と、金庫の記録。
 *   ・両方とも答えなかった … false（倉庫から返事が来ていない）
 *   ・どちらかが答えた     … true
 *   ・片方しか渡っていない … null（**言い切らない**）
 *   1つの棚だけが読めないことは前からあるので、1つでは言いません。
 */
export function warehouseAnswering(input: SetupTodoInput): boolean | null {
  const sh = input.shelves;
  const shelvesAnswered =
    sh === null ? false : sh.total > 0 ? (sh.unknown ?? 0) < sh.total : null;
  const cashAnswered = input.cash === null ? false : true;
  if (shelvesAnswered === null) return null;
  if (shelvesAnswered || cashAnswered) return true;
  return false;
}

/** 倉庫から返事が来ていない日に、じゅんに出す1行（押しても進まないものを名指しする） */
export const WAREHOUSE_ASLEEP_NOTE =
  "いま倉庫（データのしまい場所＝売上や日報が入っている所）から返事が来ていません。" +
  "［倉庫に貼り紙を貼る］と［金庫を数えて入れる］は、いま押しても答えが出ません" +
  "（起きてから押してください）。" +
  "いまでもできるのは［サーバー側の鍵を貼り直す］の1分だけです。";

/**
 * 3つの手続きは、互いに待っていない（2026-10-15・f1-4）。
 *
 * 金庫を数える1分は、倉庫の貼り紙を待ちません（記録を置く棚がまだ無いあいだは
 * 経理の設定のひとこと欄に控えます）。順番に並んでいるのは「おすすめの順」だけです。
 */
export const INDEPENDENT_NOTE =
  "どれから押しても、その1つぶんだけ前に進みます" +
  "（金庫の1分は、倉庫の貼り紙を待ちません）。" +
  "ただし［レシート写真の置き場を閉める］だけは、先に［サーバー側の鍵を貼り直す］を済ませてからです。";

/** のこっている分だけの時間の合計（表示用。おおよそで十分） */
export function totalMinutes(items: SetupTodoItem[]): number {
  return items
    .filter((i) => i.state === "のこり")
    .reduce((sum, i) => sum + minutesOf(i.minutes), 0);
}

/**
 * 「2分」のような書き方から分だけを取る（2026-10-28）。
 * ★「10秒」は **0分** として数えます。そのまま数字だけ拾うと
 *   10分として足され、「合わせて14分ほど」と大げさに言ってしまいます。
 */
export function minutesOf(label: string): number {
  if (label.includes("秒") && !label.includes("分")) return 0;
  return Number(label.replace(/[^\d]/g, "")) || 0;
}
