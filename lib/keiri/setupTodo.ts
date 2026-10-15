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

/** その手続きが済んでいるか */
export type SetupTodoState = "のこり" | "済み" | "分からない";

export type SetupTodoId = "shelves" | "cash" | "key";

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
   * 「3つは互いに待っていない」ことを1行で（2026-10-15・f1-4）。
   *
   * のこりが2件以上のときだけ出す。順番に見えると
   * 「上が済むまで下は押しても意味が無い」と読まれ、1分で済む手続きが
   * 2分の手続きを待つことになる（実際に 2026-10-15 にそう読まれた）。
   */
  independentNote: string | null;
};

/** 窓口が倉庫を読んで分かったこと。読めなければ null（＝分からない） */
export type SetupTodoInput = {
  /** 貼り紙が何本 流れたか */
  shelves: { done: number; total: number } | null;
  /** サーバー側の鍵 */
  key: { configured: boolean; usable: boolean } | null;
  /**
   * 金庫を数えた記録。
   * shelfMissing＝記録を置く棚（貼り紙①）がまだ無い。
   * counted＝数えた記録が1行でもあるか。
   */
  cash: { shelfMissing: boolean; counted: boolean; countedInMemo?: boolean } | null;
};

const SQL_SHEET = "/keiri/sql";
const KEY_SHEET = "/keiri/key";
const CASH_SHEET = "/keiri";

function shelvesItem(input: SetupTodoInput["shelves"]): SetupTodoItem {
  const base = {
    id: "shelves" as const,
    order: 1,
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
  return {
    ...base,
    state: "のこり",
    detail: `${input.done}／${input.total} が流れています（のこり ${Math.max(
      0,
      input.total - input.done,
    )} 本）`,
  };
}

function cashItem(input: SetupTodoInput["cash"]): SetupTodoItem {
  const base = {
    id: "cash" as const,
    order: 2,
    title: "金庫を数えて、金額を1回 入れる",
    minutes: "1分",
    benefit: "「計算上の現金」と「実際の金庫」が合っているかが、その場で分かります",
    href: CASH_SHEET,
    checks: ["f1-4"],
    // ★2回目を書き忘れると、押しても記録が残らない（f1-4 が確かめられない）
    presses: ["この金額で比べる", "この結果を控えに残す（これで終わりです）"],
  };
  if (!input) {
    return { ...base, state: "分からない", detail: "いま確かめられませんでした" };
  }
  // ★棚がまだ無くても、数えた1回は控えに残ります（2026-10-13・f1-4）。
  //   「入れても残りません」と言い続けると、1分で済む手続きが2分の貼り紙を待ちます。
  if (input.counted) {
    return {
      ...base,
      state: "済み",
      detail: input.countedInMemo
        ? "数えた記録が控えに残っています（棚ができたら、そのまま記録に移ります）"
        : "数えた記録が残っています",
    };
  }
  if (input.shelfMissing) {
    return {
      ...base,
      state: "のこり",
      detail:
        "棚は準備中ですが、いま入れれば控えに残ります" +
        "（貼り紙を待ちません。画面にその場で答えも出ます）",
    };
  }
  return { ...base, state: "のこり", detail: "数えた記録がまだ1件もありません" };
}

function keyItem(input: SetupTodoInput["key"]): SetupTodoItem {
  const base = {
    id: "key" as const,
    order: 3,
    title: "サーバー側の鍵を貼り直す",
    minutes: "1分",
    benefit: "毎日の自動の控え（バックアップ）が戻り、お店の行を自動で作れるようになります",
    href: KEY_SHEET,
    checks: [],
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

/** 「のこり」を先に、同じなら order の小さい順 */
function sortItems(items: SetupTodoItem[]): SetupTodoItem[] {
  const rank = (s: SetupTodoState) => (s === "のこり" ? 0 : s === "分からない" ? 1 : 2);
  return [...items].sort((a, b) => rank(a.state) - rank(b.state) || a.order - b.order);
}

export function buildSetupTodo(input: SetupTodoInput): SetupTodo {
  const items = sortItems([
    shelvesItem(input.shelves),
    cashItem(input.cash),
    keyItem(input.key),
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
    independentNote: remaining >= 2 ? INDEPENDENT_NOTE : null,
  };
}

/**
 * 3つの手続きは、互いに待っていない（2026-10-15・f1-4）。
 *
 * 金庫を数える1分は、倉庫の貼り紙を待ちません（記録を置く棚がまだ無いあいだは
 * 経理の設定のひとこと欄に控えます）。順番に並んでいるのは「おすすめの順」だけです。
 */
export const INDEPENDENT_NOTE =
  "この3つは互いに待っていません。どれから押しても、その1つぶんだけ前に進みます" +
  "（金庫の1分は、倉庫の貼り紙を待ちません）。";

/** のこっている分だけの時間の合計（表示用。おおよそで十分） */
export function totalMinutes(items: SetupTodoItem[]): number {
  return items
    .filter((i) => i.state === "のこり")
    .reduce((sum, i) => sum + (Number(i.minutes.replace(/[^\d]/g, "")) || 0), 0);
}
