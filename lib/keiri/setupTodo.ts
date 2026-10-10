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
  cash: { shelfMissing: boolean; counted: boolean } | null;
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
  };
  if (!input) {
    return { ...base, state: "分からない", detail: "いま確かめられませんでした" };
  }
  if (input.shelfMissing) {
    return {
      ...base,
      state: "のこり",
      detail:
        "いま入れても、画面にその場で答えは出ますが記録は残りません" +
        "（記録の棚は上の貼り紙でできます）",
    };
  }
  if (input.counted) {
    return { ...base, state: "済み", detail: "数えた記録が残っています" };
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

  return { items, remaining, unknown, allDone, summary };
}

/** のこっている分だけの時間の合計（表示用。おおよそで十分） */
export function totalMinutes(items: SetupTodoItem[]): number {
  return items
    .filter((i) => i.state === "のこり")
    .reduce((sum, i) => sum + (Number(i.minutes.replace(/[^\d]/g, "")) || 0), 0);
}
