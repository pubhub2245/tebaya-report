/**
 * 「金庫を数えて出た差は、ぜんぶ名前が付いているか」を1つに畳むところ
 * （2026-11-08・f1-4）。**計算だけ**（倉庫は触りません・金額は1円も作りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   じゅんが金庫を1分 数えると、画面に「差　◯◯円（金庫のほうが少ない）」と出ます。
 *   そのあと、差の心当たりに**名前を付けた説明**が最大5つ 並びます：
 *     ① 数え始めの日より前に払った経費　② 日報がまだ入っていない日
 *     ③ レジの過不足　④ 現場スタッフの立替をお返しした分　⑤ 払った記録が無い日当
 *
 *   ところが、その5つは**それぞれが自分のことしか言いません**。
 *   ＝ 読んだ人には「で、この差は ぜんぶ説明が付いたの？ まだ探すものがあるの？」が
 *   分かりません。5つの段落を自分で足し算して、差と見比べるしかない形でした。
 *   **1分 数えてもらったのに、答えが出ない**ということです。
 *
 *   f1-4 の合否（今の現金残高が、実際の金庫の残高と合うか）は、まさにこの
 *   「差がぜんぶ説明が付いたか」で決まります。そこを1か所にまとめます。
 *
 * ■ ここでやること
 *   名前が付いた分を「説明できる幅（いちばん少ない額 〜 いちばん多い額）」として足し、
 *   差がその幅に収まるかを見ます。収まれば**探し物はありません**。
 *   はみ出た分だけが**本当の探し物**です。
 *
 * ■ ここで絶対にしないこと（大事）
 *   ① **金額を1円も直しません。** 「計算上の現金」も、月の経費・利益・1枚の要約・
 *      会計ソフト向けCSV・試算表も 1円も変えません。出すのは説明の行だけです。
 *   ② **分からないものを「0円」と言いません。** 読めていない所・金額が分からない所が
 *      1つでもあって、しかも差がはみ出しているときは、「探し物がある」と**言い切りません**
 *      （covered を null＝言えません にします）。
 *      読めていない所が、その残りを説明してしまうかもしれないからです。
 *   ③ 「誰かが取った」などの理由を決めつけません。
 *
 * ■ 符号の決まり（ここを間違えると逆のことを言うので、1か所に書いておきます）
 *   diff ＝ 計算上の残高 − 数えた金額。**プラス＝金庫のほうが少ない**。
 *   それぞれの分が diff をどちら向きに動かすか：
 *     ・レジの過不足 … 日報の合計が不足（マイナス）なら、実際の現金はそのぶん少ない
 *       ＝ diff を **＋(−合計)** 動かす。**金額が記録に入っているので確定**
 *     ・数え始めより前に払った経費／現場の立替のお返し／払った記録が無い日当
 *       … どれも金庫からお金が出る側なので diff を**プラス**に動かすが、
 *         いくら出たかは記録が無い ＝ **0円 〜 合計 の幅**（上限だけが分かる）
 *   ★「日報がまだ入っていない日」は金額も向きも分からないので、幅には足さず
 *     「分からない所」として数えます。
 *
 * ■ ここは通信をしません。だから検算（tests/keiriCashDiffCoverage.test.ts）で固定できます。
 */

import { NEAR_ENOUGH_YEN } from "./cashCheck";

/** 差の説明に名前を付けた分、1つ */
export type CashDiffPiece = {
  key: "registerDiff" | "openingExpenses" | "fieldRepay" | "unpaidPayroll";
  /** 画面に出す名前 */
  label: string;
  /** その欄を読めたか（**0円と取り違えないため**。読めていなければ幅に足さない） */
  readable: boolean;
  /** 説明できる差の いちばん少ない額（円・符号は diff と同じ向き） */
  lo: number;
  /** 説明できる差の いちばん多い額（円・符号は diff と同じ向き） */
  hi: number;
  /** その分に当てはまる行の件数（0 なら幅に足さない） */
  rows: number;
};

export const PIECE_LABEL: Record<CashDiffPiece["key"], string> = {
  registerDiff: "レジの過不足",
  openingExpenses: "数え始めの日より前に払った経費",
  fieldRepay: "現場スタッフの立替をお返しした分",
  unpaidPayroll: "払った記録が無い日当",
};

/** レジの過不足（記録に入っている額なので、幅ではなく1点） */
export function registerDiffPiece(gap: {
  readable: boolean;
  rows: number;
  total: number;
}): CashDiffPiece {
  // 不足（マイナス）＝実際の現金はそのぶん少ない＝diff はプラス側に動く
  const effect = -Math.round(gap.total);
  return {
    key: "registerDiff",
    label: PIECE_LABEL.registerDiff,
    readable: !!gap.readable,
    lo: effect,
    hi: effect,
    rows: Math.max(0, Math.round(gap.rows)),
  };
}

/** 数え始めの日より前に、金庫から払った経費（0円 〜 合計） */
export function openingExpensesPiece(
  gap: { count: number; total: number },
  readable = true,
): CashDiffPiece {
  const total = Math.max(0, Math.round(gap.total));
  return {
    key: "openingExpenses",
    label: PIECE_LABEL.openingExpenses,
    readable,
    lo: 0,
    hi: total,
    rows: Math.max(0, Math.round(gap.count)),
  };
}

/** 現場スタッフの立替をお返しした分（0円 〜 合計） */
export function fieldRepayPiece(gap: {
  readable: boolean;
  rows: number;
  total: number;
}): CashDiffPiece {
  return {
    key: "fieldRepay",
    label: PIECE_LABEL.fieldRepay,
    readable: !!gap.readable,
    lo: 0,
    hi: Math.max(0, Math.round(gap.total)),
    rows: Math.max(0, Math.round(gap.rows)),
  };
}

/** 払った記録が無い日当（0円 〜 残り） */
export function unpaidPayrollPiece(gap: {
  readable: boolean;
  rows: number;
  unpaid: number;
}): CashDiffPiece {
  return {
    key: "unpaidPayroll",
    label: PIECE_LABEL.unpaidPayroll,
    readable: !!gap.readable,
    lo: 0,
    hi: Math.max(0, Math.round(gap.unpaid)),
    rows: Math.max(0, Math.round(gap.rows)),
  };
}

export type CashDiffCoverage = {
  /** 差そのものが出ているか（まだ数えていない・計算上の現金が出ない なら false） */
  measurable: boolean;
  /** 差（計算上 − 数えた。プラス＝金庫のほうが少ない） */
  diff: number | null;
  /** 名前が付いた分で説明できる いちばん少ない額 */
  min: number;
  /** 同じく いちばん多い額 */
  max: number;
  /** 幅に足せた分の件数（名前が付いて、読めて、行があるもの） */
  named: number;
  /** その名前（画面に出す順） */
  namedLabels: string[];
  /** 読めていない／金額が分からない所の名前（あれば言い切らない） */
  unknownLabels: string[];
  /**
   * 差が「名前が付いた分の幅」に収まっているか。
   * true＝ほかに探し物はない／false＝はみ出た分がある／**null＝いまは言えない**
   */
  covered: boolean | null;
  /** はみ出た分（covered が false のときだけ 0 以外。プラス＝金庫がさらに少ない側） */
  rest: number;
  /** 画面に出す行（当てはまらなければ空） */
  lines: string[];
  /** ひとこと（金額を入れない言い方） */
  summary: string;
};

export const EMPTY_CASH_DIFF_COVERAGE: CashDiffCoverage = {
  measurable: false,
  diff: null,
  min: 0,
  max: 0,
  named: 0,
  namedLabels: [],
  unknownLabels: [],
  covered: null,
  rest: 0,
  lines: [],
  summary: "まだ金庫を数えていないので、差の内わけは出していません。",
};

/** 円の書き方（符号は付けず、向きは言葉で言う） */
function yen(n: number): string {
  return `${Math.abs(Math.round(n)).toLocaleString("ja-JP")}円`;
}

/** 差の向きを言葉で */
function dirWord(n: number): string {
  return n > 0 ? "金庫のほうが少ない" : "金庫のほうが多い";
}

/**
 * 差に名前が付いているかを畳む。
 *
 * @param diff        計算上の残高 − 数えた金額（まだ数えていなければ null）
 * @param pieces      名前が付いた分（読めていないものも、読めていない印のまま渡す）
 * @param unknown     金額も向きも分からない所の名前（例：日報がまだ入っていない日）
 */
export function measureCashDiffCoverage(params: {
  diff: number | null | undefined;
  pieces: readonly CashDiffPiece[];
  unknown?: readonly string[];
}): CashDiffCoverage {
  const diff =
    params.diff === null || params.diff === undefined || !Number.isFinite(params.diff)
      ? null
      : Math.round(params.diff);
  const pieces = params.pieces ?? [];
  const unknownFromPieces = pieces
    .filter((p) => !p.readable)
    .map((p) => p.label);
  const unknownLabels = [...unknownFromPieces, ...(params.unknown ?? [])];

  // 幅に足せるのは「読めて・行があるもの」だけ
  const usable = pieces.filter((p) => p.readable && p.rows > 0);
  let min = 0;
  let max = 0;
  for (const p of usable) {
    min += Math.min(p.lo, p.hi);
    max += Math.max(p.lo, p.hi);
  }
  min = Math.round(min);
  max = Math.round(max);
  const namedLabels = usable.map((p) => p.label);

  if (diff === null) {
    return {
      ...EMPTY_CASH_DIFF_COVERAGE,
      min,
      max,
      named: usable.length,
      namedLabels,
      unknownLabels,
    };
  }

  // 差がおつりの誤差の範囲なら、そもそも探し物の話をしない
  if (Math.abs(diff) < NEAR_ENOUGH_YEN) {
    return {
      measurable: true,
      diff,
      min,
      max,
      named: usable.length,
      namedLabels,
      unknownLabels,
      covered: true,
      rest: 0,
      lines: [],
      summary: "差はおつりの誤差の範囲なので、探し物はありません。",
    };
  }

  const within = diff >= min - NEAR_ENOUGH_YEN && diff <= max + NEAR_ENOUGH_YEN;
  const overshoot = diff > max ? diff - max : diff < min ? diff - min : 0;
  const covered: boolean | null = within ? true : unknownLabels.length > 0 ? null : false;
  const rest = covered === false ? Math.round(overshoot) : 0;

  const lines: string[] = [];
  const namedPart =
    usable.length === 0
      ? "名前が付いた分は1つもありません"
      : `名前が付いた ${usable.length} つ（${namedLabels.join("／")}）`;

  if (covered === true) {
    lines.push(
      `差 ${yen(diff)}（${dirWord(diff)}）は、${namedPart}だけで説明がつく範囲` +
        `（${yen(min)}〜${yen(max)}）に収まっています。`,
    );
    // ★ここで「金庫と帳簿が合っています」とは言いません（2026-11-08・f1-4）。
    //   名前が付いた分のうち、レジの過不足いがいは「いくら出たかの記録が無い＝上限だけ」
    //   なので、金庫と帳簿の金額はいまも**ちがいます**。ちがう理由に名前が付いた、
    //   というだけです。そこを言い切ると、情報源に無いことを「できた」と書く形になります。
    lines.push(
      "＝ 帳簿に書いていない現金の出入りを、ほかに探す必要はありません" +
        "（金庫と帳簿がちがうのは、名前が付いた分だけです）。",
    );
    if (unknownLabels.length > 0) {
      lines.push(
        `※ ${unknownLabels.join("／")} は いま読めていませんが、` +
          "差はすでに名前が付いた分の範囲に収まっているので、答えは変わりません。",
      );
    }
  } else if (covered === false) {
    lines.push(
      `差 ${yen(diff)}（${dirWord(diff)}）のうち、${namedPart}で説明できるのは` +
        `多くても ${yen(diff > max ? max : min)} までです。`,
    );
    lines.push(
      `＝ 残り ${yen(rest)}（${dirWord(rest)}）には まだ名前が付いていません。` +
        "ここが本当の探し物です。下の心当たりを見てください。",
    );
  } else {
    lines.push(
      `差 ${yen(diff)}（${dirWord(diff)}）のうち、${namedPart}で説明できるのは` +
        `多くても ${yen(diff > max ? max : min)} までです。`,
    );
    lines.push(
      `残り ${yen(overshoot)} は、いま読めていない所（${unknownLabels.join("／")}）で` +
        "説明がつくかもしれません。",
    );
    lines.push("＝ 「探し物がある」とも「無い」とも、いまは言えません。");
  }

  const summary =
    covered === true
      ? "差は、名前が付いた分の範囲に収まっています（探し物はありません）。"
      : covered === false
        ? "差のうち、名前が付いていない分が残っています（ここが探し物です）。"
        : "読めていない所があるので、探し物があるかどうかは いま言えません。";

  return {
    measurable: true,
    diff,
    min,
    max,
    named: usable.length,
    namedLabels,
    unknownLabels,
    covered,
    rest,
    lines,
    summary,
  };
}

/**
 * 外から確かめる窓口に返す形。
 * **本物の金額は1円も返しません**（checkWindow.ts の決まり③）。
 * 返すのは「測れたか・収まっているか・名前の数・読めていない所の名前」だけです。
 */
export type CashDiffCoverageWindow = {
  measurable: boolean;
  /** true＝探し物なし／false＝名前の付かない分が残っている／null＝いまは言えない */
  covered: boolean | null;
  /** 幅に足せた名前の数 */
  named: number;
  namedLabels: string[];
  unknownLabels: string[];
  /** 画面にこの行が出るか */
  shown: boolean;
  /** ひとこと（金額は入れない） */
  note: string;
  /**
   * **合否の読み方**（2026-11-08・f1-4）。
   * この窓口だけを見て合否を付け間違えないように、決まりをここに書いておきます。
   */
  howto: string;
};

export function buildCashDiffCoverageWindow(
  c: CashDiffCoverage,
): CashDiffCoverageWindow {
  return {
    measurable: c.measurable,
    covered: c.covered,
    named: c.named,
    namedLabels: c.namedLabels,
    unknownLabels: c.unknownLabels,
    shown: c.lines.length > 0,
    note: c.measurable
      ? c.summary
      : "まだ金庫を数えていないので、差に名前が付いているかは測れません。",
    howto:
      "f1-4 の合否は、この covered と、上の matched（ぴったり／ほぼ合っていたか）の" +
      "どちらかで見てください。matched が true、または covered が true なら" +
      "『合っている』側です（差があっても、名前が付いた分で説明がつく範囲なので）。" +
      "covered が false のときだけ『名前の付かない差が残っている』。" +
      "covered が null のときは、読めていない所があるので**合否を付けないでください**。",
  };
}
