/**
 * 「金庫の現金を、2通りのどちらの数え方で数えるか」を見分けるところ
 * （2026-10-12・kp250・f1-4／f1-2）。**計算だけ**（倉庫は触りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   じゅんが金庫を数えても、**比べる相手が2通りある**ことが 10/11 に分かりました。
 *   ちがうのは「**前の月に立て替えて、今月 返したお金**」を引くかどうかの1点です。
 *     ・いまの画面 … 引いていません（立て替えた日が前の月なので、そもそも読んでいない）
 *     ・返した日で引く数え方 … 引きます（お金が金庫から出たのは「返した日」なので）
 *   手羽屋の9月では、この差が **9行ぶん** あります。
 *
 *   このままだと、じゅんが金庫を数えて金額を入れたときに
 *   「金庫のほうが 49万円 少ないです。書き忘れた現金の支払いを見てください」と出ます。
 *   **書き忘れなど1件も無いのに、49万円ぶんの探し物をさせてしまう**ということです。
 *   数え方のちがいなら、そう言わないといけません。
 *
 * ■ どう直すか
 *   比べる相手を2つ並べ、**どちらに合うか**を画面が自分で言うようにします。
 *   合った側が、この先 採る数え方の答えになります（kp250 ②の決めごと）。
 *   ★金額はこちらで1円も直しません。出すのは「どちらに合うか」だけです。
 *
 * ■ ここは通信をしません。だから検算（tests/keiriCashVariant.test.ts）で固定できます。
 */

import { NEAR_ENOUGH_YEN } from "./cashCheck";

/** 数え方の見分け */
export type CashVariantKey =
  /** いまの画面の数え方（前の月に立て替えて今月 返した分を引かない） */
  | "nowScreen"
  /** 返した日で引く数え方（立て替えた日がいつでも、返した日に引く） */
  | "withEarlierRepaid"
  /** いまの画面の数え方から、レジに残してあるつり銭を別に置いた金額（金庫だけを数えたとき） */
  | "nowScreenSafeOnly"
  /** 返した日で引く数え方から、さらにレジのつり銭を別に置いた金額 */
  | "withEarlierRepaidSafeOnly";

/** 画面に出す数え方の名前 */
export const CASH_VARIANT_LABEL: Record<CashVariantKey, string> = {
  nowScreen: "いまの画面の数え方",
  withEarlierRepaid: "前の月に立て替えて今月 返した分も引く数え方",
  nowScreenSafeOnly: "いまの画面の数え方から、レジのつり銭を別に置いた金額（金庫だけ）",
  withEarlierRepaidSafeOnly:
    "前の月に返した分も引き、レジのつり銭も別に置いた金額（金庫だけ）",
};

/** それぞれの数え方の、ひとこと説明 */
export const CASH_VARIANT_NOTE: Record<CashVariantKey, string> = {
  nowScreen:
    "数え始めの日より前に立て替えたお金は、返した分も引いていません（いま画面に出ている金額です）。",
  withEarlierRepaid:
    "前の月までに立て替えて、そのあと返したお金も「返した日」に引きます。",
  nowScreenSafeOnly:
    "閉店のときレジに残してあるつり銭（日報の実測）を引いた金額です。金庫だけを数えたときはこちらに合います。",
  withEarlierRepaidSafeOnly:
    "返した分を引いたうえで、レジに残してあるつり銭（日報の実測）も引いた金額です。",
};

/** レジのつり銭を別に置いた数え方か（＝じゅんが金庫だけを数えた、ということ） */
export function isSafeOnlyVariant(key: CashVariantKey): boolean {
  return key === "nowScreenSafeOnly" || key === "withEarlierRepaidSafeOnly";
}

/** 「前の月に返した分も引く」側の数え方か */
export function isWithRepaidVariant(key: CashVariantKey): boolean {
  return key === "withEarlierRepaid" || key === "withEarlierRepaidSafeOnly";
}

/** 比べる相手1つ */
export type CashVariant = {
  key: CashVariantKey;
  label: string;
  note: string;
  /** 数えた日の時点の計算上の残高 */
  balance: number;
};

/**
 * 比べる相手を組み立てる。
 *
 * ★同じ金額になる相手は足しません（意味の無い選択肢を画面に出さないため）。
 * ★ここでは金額を作りません。渡された残高を足し引きするだけです。
 *
 * @param screenBalance        いまの画面の数え方の残高
 * @param withRepaidBalance    返した日で引く数え方の残高（読めなければ null）
 * @param registerFloat        レジに残してあるつり銭の合計（日報の実測。0・null なら足さない）
 */
export function buildCashVariants(params: {
  screenBalance: number | null;
  withRepaidBalance: number | null;
  /**
   * レジに残してあるつり銭（2026-10-12・f1-4）。
   * ★これを渡すと「金庫だけを数えたとき」の相手も並びます。
   *   渡さない／0 のときは、今までどおり最大2つしか並びません。
   */
  registerFloat?: number | null;
}): CashVariant[] {
  const { screenBalance, withRepaidBalance } = params;
  if (screenBalance === null) return [];
  const float = Math.round(params.registerFloat ?? 0);
  const out: CashVariant[] = [];
  /** 同じ金額の相手は並べない */
  const push = (key: CashVariantKey, balance: number) => {
    const yen = Math.round(balance);
    if (out.some((v) => v.balance === yen)) return;
    out.push({
      key,
      label: CASH_VARIANT_LABEL[key],
      note: CASH_VARIANT_NOTE[key],
      balance: yen,
    });
  };
  push("nowScreen", screenBalance);
  if (withRepaidBalance !== null) push("withEarlierRepaid", withRepaidBalance);
  // レジのつり銭は、金庫の外に置いてあるお金。金庫だけを数えたときはこちらに合う
  if (float > 0) {
    push("nowScreenSafeOnly", screenBalance - float);
    if (withRepaidBalance !== null) {
      push("withEarlierRepaidSafeOnly", withRepaidBalance - float);
    }
  }
  return out;
}

/** どの数え方に合ったか */
export type CashVariantMatch =
  /** 比べる相手が1つしか無い（数え方のちがいが無い月） */
  | "single"
  /** どちらにも合わなかった */
  | "neither"
  | CashVariantKey;

export type CashVariantPick = {
  /** 比べる相手が2つ以上あるか（2つ無ければ、この仕組みは画面に出しません） */
  hasChoice: boolean;
  /** どれに合ったか */
  match: CashVariantMatch;
  /** 合った数え方（合わなければ null） */
  matched: CashVariant | null;
  /** 近い順に並べた、それぞれの差（計算 − 数えた金額） */
  rows: { variant: CashVariant; diff: number; near: boolean }[];
  /** 人が読む1〜2行 */
  lines: string[];
};

/** 円の書き方（画面と同じ3桁区切り） */
function yen(n: number): string {
  return `${Math.round(n).toLocaleString("ja-JP")}円`;
}

/**
 * 数えた金額が、どちらの数え方に合うかを見分ける。
 *
 * ■ 「合う」の線は、金庫の突き合わせと同じ 1,000円 未満（おつりの誤差）です。
 *   2つの数え方のどちらにも合わなければ、「どちらでもない」と正直に言います
 *   （こちらで金額を合わせることはしません）。
 */
export function pickCashVariant(params: {
  variants: CashVariant[];
  /** 数えた金額 */
  counted: number;
}): CashVariantPick {
  const counted = Math.round(params.counted);
  const rows = params.variants
    .map((variant) => {
      const diff = variant.balance - counted;
      return { variant, diff, near: Math.abs(diff) < NEAR_ENOUGH_YEN };
    })
    .sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));

  const hasChoice = rows.length >= 2;
  if (rows.length === 0) {
    return { hasChoice: false, match: "neither", matched: null, rows, lines: [] };
  }
  if (!hasChoice) {
    return {
      hasChoice: false,
      match: "single",
      matched: rows[0].near ? rows[0].variant : null,
      rows,
      lines: [],
    };
  }

  const hit = rows.find((r) => r.near) ?? null;
  const count = kanjiCount(rows.length);
  // 2つなら「どちらにも」、3つ以上なら「どれにも」（日本語として自然な言い方にそろえる）
  const anyOf = rows.length === 2 ? "どちらにも" : "どれにも";
  if (!hit) {
    return {
      hasChoice: true,
      match: "neither",
      matched: null,
      rows,
      lines: [
        `数え方は${count}通りありますが、${anyOf}合いませんでした。`,
        ...rows.map(
          (r) =>
            `${r.variant.label}　${yen(r.variant.balance)}（差 ${yen(Math.abs(r.diff))}）`,
        ),
        "数え方のちがいでは説明がつかない差です。下の「よくある原因」を見てください。",
      ],
    };
  }

  return {
    hasChoice: true,
    match: hit.variant.key,
    matched: hit.variant,
    rows,
    lines: [
      `数え方は${count}通りありますが、「${hit.variant.label}」のほうに合いました。`,
      ...rows.map(
        (r) =>
          `${r.variant.key === hit.variant.key ? "✅ " : "　"}${r.variant.label}　` +
          `${yen(r.variant.balance)}（差 ${yen(Math.abs(r.diff))}）`,
      ),
      ...matchedSentences(hit.variant.key),
    ],
  };
}

/** 「2」「3」「4」を漢数字にする（画面の言い方にそろえる） */
function kanjiCount(n: number): string {
  return ["", "1", "2", "3", "4", "5", "6"][n] ?? String(n);
}

/**
 * 合った数え方から、じゅんに出す結びの1〜2行を作る。
 * ★「書き忘れを探してください」とは言いません。数え方のちがいなら、そう言います。
 */
function matchedSentences(key: CashVariantKey): string[] {
  const out: string[] = [];
  if (isWithRepaidVariant(key)) {
    out.push(
      "いま画面に出ている現金は、前の月に立て替えて返した分を引いていないぶん多く出ています。こちらで数え方をそろえます（書き忘れを探す必要はありません）。",
    );
  }
  if (isSafeOnlyVariant(key)) {
    out.push(
      "数えていただいたのは金庫だけで、レジに残してあるつり銭は金庫の外にあります。その分も合わせると計算どおりです（書き忘れを探す必要はありません）。",
    );
  }
  if (out.length === 0) {
    out.push("いま画面に出ている数え方で合っています。このまま進めて大丈夫です。");
  }
  return out;
}

/**
 * 外から確かめるための畳んだ答え（金額は出しません・2026-10-12・f1-4）。
 *
 * ■ なぜ要るのか
 *   じゅんの経理の画面は合言葉の内側なので、検査役（B2）も こちら（Claude）も
 *   「数え方が2通りに分かれているのか」を目で見られません。
 *   **件数と、分かれているかどうかだけ**を返します。
 */
export type CashVariantWindow = {
  /** 数え方が2通りに分かれているか */
  differs: boolean;
  /** 「返した日で引く数え方」でだけ数に入る立替の行数 */
  extraRows: number;
  /** そのうち、見ている月に返した行数 */
  repaidRows: number;
  /** 読めたか（立替の棚が読めないときは false） */
  readable: boolean;
  /** 人が読む1行 */
  note: string;
};

/**
 * 外に出す形に畳む。
 *
 * @param extraRows 「返した日で引く数え方」でだけ数に入る立替の行
 * @param readable  立替の棚が読めたか
 */
export function cashVariantWindow(params: {
  extraRows: { settledInMonth: boolean }[];
  readable: boolean;
}): CashVariantWindow {
  if (!params.readable) {
    return {
      differs: false,
      extraRows: 0,
      repaidRows: 0,
      readable: false,
      note: "立替の棚が読めなかったので、数え方のちがいは数えていません（0件と取り違えないこと）。",
    };
  }
  const extra = params.extraRows.length;
  const repaid = params.extraRows.filter((r) => r.settledInMonth).length;
  return {
    differs: repaid > 0,
    extraRows: extra,
    repaidRows: repaid,
    readable: true,
    note:
      repaid > 0
        ? `前の月までに立て替えて、この月に返した立替が ${repaid} 行あります。` +
          "金庫を数えたときに、2通りの数え方のどちらに合うかを画面が出します（金額はここでは返しません）。"
        : "この月は、数え方のちがいがありません（前の月に立て替えて この月に返した立替が0行）。",
  };
}
