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

function shelvesItem(input: SetupTodoInput["shelves"]): SetupTodoItem {
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
  const pressesFor = (shelfMissing: boolean): string[] =>
    compareAlsoKeeps(shelfMissing)
      ? ["この金額で比べる（これで控えに残ります。押すのはこの1回だけです）"]
      : ["この金額で比べる", "この結果を控えに残す（これで終わりです）"];
  if (!input) {
    return { ...base, state: "分からない", detail: "いま確かめられませんでした" };
  }
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
        "棚は準備中ですが、いま入れれば控えに残ります" +
        "（貼り紙を待ちません。押すのは［この金額で比べる］の1回だけで、" +
        "答えがその場に出て、そのまま控えに残ります）",
    };
  }
  return {
    ...base,
    presses: pressesFor(false),
    state: "のこり",
    detail: "数えた記録がまだ1件もありません",
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
      "仕上げでいま唯一の不合格『よその店のデータが見えないか』は、これで閉まります。" +
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
      "仕上げの『よその店のデータが見えないか』（③）はこれで閉まります",
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
    shelvesItem(input.shelves),
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
