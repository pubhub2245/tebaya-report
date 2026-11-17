/**
 * 「じゅんが金庫を1分 数えたら、ほんとうに はい／いいえ の答えが出るのか」を
 * **数えてもらう前に**、本物の行で確かめるところ（2026-11-17・f1-4）。
 * **計算だけ**（倉庫は触りません・金額は1円も作りません・1行も書き換えません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   f1-4（計算上の現金と、実際の金庫が合うか）の合否は、じゅんが1回 数えた
 *   その時に初めて出ます。ところが合否は「差に ぜんぶ名前が付いたか」で決まり、
 *   名前が付かない所（＝分からない所）が1つでも残っていると、
 *   答えは **はい でも いいえ でもなく「言えません」** になります。
 *
 *   いまの窓口は、数える前は差が無いので coverage を測れません
 *   （diffCoverage.measurable が false）。＝ **1分 数えてもらうまで、
 *   その1分が実るのかどうかが こちら側から分かりませんでした。**
 *   分からない所が残る形のまま頼むと、じゅんは1分 使ったのに
 *   「合否は付けていません」と出ます。これは レジのつり銭・銀行に入れた分で
 *   すでに2回 やりかけた「無い探し物」と同じ形です。
 *
 * ■ ここでやること
 *   いまの本物の行（差の内わけ5つ＋分からない所）をそのまま使い、
 *   **答えの出し方を3通り**（①ぜんぶ答えた ②銀行に入れたと答えた ③何も答えない）、
 *   **差の置きどころを5通り**（ぴったり／おつりの範囲／説明のつく幅のいちばん多い所／
 *   その幅より1万円 多い／少ない）に置いて、画面とまったく同じ関数
 *   （measureCashDiffCoverage・cashCountOk）で15通りの答えを先に出します。
 *
 *   いちばん大事な答えは1つだけです——
 *   **「ぜんぶ答えたとき、どの差でも 合否が出るか（verdictAlways）」。**
 *   ここが false なら、じゅんの1分は実りません。頼む前に直します。
 *
 * ■ ここで絶対にしないこと
 *   ・金額を1円も返しません（差の置きどころは**言葉だけ**で、円では出しません）。
 *     説明のつく幅そのものも返しません（本物の日当・経費の額になるため）。
 *   ・倉庫に1行も書きません。じゅんの答えを勝手に決めて保存もしません。
 *   ・ここで出した「もしも」の答えを、f1-4 の合否にしません
 *     （合否は いちばん上の ok ＝ 本当に数えた結果だけで決めます）。
 */

import { NEAR_ENOUGH_YEN } from "./cashCheck";
import { cashCountOk, type CashCountVerdict } from "./cashCountWindow";
import {
  fieldRepayPiece,
  measureCashDiffCoverage,
  openingExpensesPiece,
  registerDiffPiece,
  sameReportPiece,
  unpaidPayrollPiece,
  type CashDiffPiece,
} from "./cashDiffCoverage";
import { DEPOSIT_UNKNOWN_LABEL } from "./cashDepositGap";

/**
 * 「日報がまだ入っていない日」を 分からない所として数えるときの名前。
 * ★窓口（app/api/keiri/cashcount）と ここで**同じ文字**を使うため、1か所に置きます。
 */
export const BOOKS_GAP_UNKNOWN_LABEL = "日報がまだ入っていない日";

/**
 * もしもの答えの出し方。
 *
 * ★①②は どちらも「ぜんぶ答えた」形です。ちがうのは「日当を もう金庫からお渡ししたか」
 *   への答えだけで、**この答えで金庫の中身は正反対になります**
 *   （お渡し済み＝そのぶん金庫から出ている／まだ＝金庫に残っている）。
 *   じゅんが どちらを えらんでも1分が実ることを確かめたいので、両方 計算します。
 */
export type WhatIfAnswerKey =
  /** ①ぜんぶ答えた・日当はまだお渡ししていない（空きは お休み・銀行には入れていない） */
  | "ぜんぶ答えた（日当はまだ）"
  /** ②ぜんぶ答えた・日当はもうお渡しした */
  | "ぜんぶ答えた（日当はお渡しした）"
  /** ③銀行に入れたと答えた（置き場が無いので金額は残らない） */
  | "銀行に入れたと答えた"
  /** ④何も答えない（いまのまま数えた） */
  | "何も答えない";

/** 差の置きどころ（**言葉だけ**。円では出しません） */
export type WhatIfWhere =
  | "ぴったり（差0円）"
  | "おつりの範囲（1,000円より小さい）"
  | "説明のつく幅のいちばん多い所"
  | "その幅より1万円 多い（金庫がさらに少ない側）"
  | "その幅より1万円 少ない（金庫のほうが多い側）";

const WHERES: WhatIfWhere[] = [
  "ぴったり（差0円）",
  "おつりの範囲（1,000円より小さい）",
  "説明のつく幅のいちばん多い所",
  "その幅より1万円 多い（金庫がさらに少ない側）",
  "その幅より1万円 少ない（金庫のほうが多い側）",
];

/** 幅からどれだけ離すか（金額は返しません。中だけで使います） */
const AWAY_YEN = 10000;

export type WhatIfCase = {
  where: WhatIfWhere;
  verdict: CashCountVerdict;
  /** 差に ぜんぶ名前が付いたか（true／false／null＝言えません） */
  covered: boolean | null;
  /** 合否（true／false／null＝言えません） */
  ok: boolean | null;
};

export type WhatIfAnswerOutcome = {
  key: WhatIfAnswerKey;
  /** その答えのとき、分からない所の名前（1つも無ければ空） */
  unknownLabels: string[];
  /** 名前が付いた分の数とその名前 */
  named: number;
  namedLabels: string[];
  /** 差の置きどころ5通りの答え */
  cases: WhatIfCase[];
  /** **5通りぜんぶで 合否が出るか**（ここが false なら、1分は実りません） */
  verdictAlways: boolean;
  /** 人が読む1行 */
  line: string;
};

export type CashWhatIf = {
  /** 測れたか（内わけを1つも読めていない日は false） */
  measurable: boolean;
  outcomes: WhatIfAnswerOutcome[];
  /** ①ぜんぶ答えたときに、どの差でも合否が出るか（f1-4 の1分が実るか） */
  worthThePress: boolean;
  summary: string;
  note: string;
  howto: string;
};

/** 差の大きさから、画面と同じ言い方を出す（数え方のちがいは見ません） */
function verdictOfDiff(diff: number): CashCountVerdict {
  if (diff === 0) return "ぴったり合っている";
  return Math.abs(diff) < NEAR_ENOUGH_YEN ? "ほぼ合っている" : "合っていない";
}

/** その答えのときの内わけ（名前が付いた分）を組み立てる */
function piecesFor(
  key: WhatIfAnswerKey,
  src: CashWhatIfSource,
): CashDiffPiece[] {
  // 日当：えらんだ答えのとおりに畳む。
  //   ★「何も答えない」は、答えが1つも無い形にします（0円〜その額の幅のまま）。
  const payrollAnswer =
    key === "何も答えない"
      ? null
      : key === "ぜんぶ答えた（日当はお渡しした）"
        ? { covers: true, handed: true, notYet: false }
        : { covers: true, handed: false, notYet: true };
  return [
    registerDiffPiece(src.registerDiff),
    openingExpensesPiece(src.openingExpenses, src.openingExpensesReadable),
    fieldRepayPiece(src.fieldRepay),
    unpaidPayrollPiece(src.unpaidPayroll, payrollAnswer),
    sameReportPiece(src.sameReport),
  ];
}

/** その答えのときの「分からない所」を組み立てる */
function unknownFor(key: WhatIfAnswerKey, src: CashWhatIfSource): string[] {
  const out: string[] = [];
  // 日報の空き：①②は「お休みでした」と答えた形＝数えない
  const gapAnswered = key !== "何も答えない";
  if (src.booksGapWide && !src.booksGapHolidaysOnly && !gapAnswered) {
    out.push(BOOKS_GAP_UNKNOWN_LABEL);
  }
  // 銀行に入れた分：置き場が有れば そもそも分からない所にならない
  if (!src.depositShelfExists) {
    if (key.startsWith("ぜんぶ答えた")) {
      // 「1円も入れていない」と答えた＝数えない
    } else {
      out.push(DEPOSIT_UNKNOWN_LABEL);
    }
  }
  return out;
}

export type CashWhatIfSource = {
  registerDiff: { readable: boolean; rows: number; total: number };
  openingExpenses: { count: number; total: number };
  openingExpensesReadable: boolean;
  fieldRepay: { readable: boolean; rows: number; total: number };
  unpaidPayroll: { readable: boolean; rows: number; unpaid: number };
  sameReport: { readable: boolean; pendingGroups: number; pendingNet: number };
  /** 日報が広く空いているか */
  booksGapWide: boolean;
  /** その空きが「お休みだけ」と出店予定の表から読めたか */
  booksGapHolidaysOnly: boolean;
  /** 銀行に入れた記録の置き場が倉庫に有るか */
  depositShelfExists: boolean;
};

const NOTE =
  "金額は1円も返しません（計算上の現金・数えた金額・差・説明のつく幅のどれも）。" +
  "差の置きどころは**言葉だけ**です。1行も書き込みません。" +
  "ここは「もしも」の計算で、**f1-4 の合否ではありません**（合否は いちばん上の ok だけ）。";

const HOWTO =
  "ここは「じゅんが金庫を1分 数えたら、ちゃんと はい／いいえ が出るか」を" +
  "数える前に見る所です。**worthThePress が true なら、1分は実ります**" +
  "（どんな差が出ても合否が付きます）。false のときは、分からない所が残る形なので、" +
  "頼む前に直してください（「ぜんぶ答えた…」の unknownLabels に、その名前が出ます）。" +
  "measurable が false の日は内わけを読めなかった日で、**0件という意味ではありません**。";

/** もしもの答えを15通り 先に出す（純粋な計算） */
export function measureCashWhatIf(src: CashWhatIfSource): CashWhatIf {
  const keys: WhatIfAnswerKey[] = [
    "ぜんぶ答えた（日当はまだ）",
    "ぜんぶ答えた（日当はお渡しした）",
    "銀行に入れたと答えた",
    "何も答えない",
  ];

  // 内わけを1つも読めていない日は、もしもの答えも出しません（0件と取り違えないため）
  const anyReadable =
    src.registerDiff.readable ||
    src.openingExpensesReadable ||
    src.fieldRepay.readable ||
    src.unpaidPayroll.readable ||
    src.sameReport.readable;
  if (!anyReadable) {
    return {
      measurable: false,
      outcomes: [],
      worthThePress: false,
      summary:
        "差の内わけを1つも読めていないので、「もしも」の答えは出していません" +
        "（1分が実らないという意味ではありません）。",
      note: NOTE,
      howto: HOWTO,
    };
  }

  const outcomes: WhatIfAnswerOutcome[] = keys.map((key) => {
    const pieces = piecesFor(key, src);
    const unknown = unknownFor(key, src);
    // 幅（min〜max）を先に測る。★この金額は外に返しません
    const base = measureCashDiffCoverage({ diff: null, pieces, unknown });
    const diffs: Record<WhatIfWhere, number> = {
      "ぴったり（差0円）": 0,
      "おつりの範囲（1,000円より小さい）": 500,
      "説明のつく幅のいちばん多い所": base.max,
      "その幅より1万円 多い（金庫がさらに少ない側）": base.max + AWAY_YEN,
      "その幅より1万円 少ない（金庫のほうが多い側）": base.min - AWAY_YEN,
    };
    const cases: WhatIfCase[] = WHERES.map((where) => {
      const diff = Math.round(diffs[where]);
      const cov = measureCashDiffCoverage({ diff, pieces, unknown });
      const verdict = verdictOfDiff(diff);
      const { ok } = cashCountOk({ verdict, covered: cov.covered });
      return { where, verdict, covered: cov.covered, ok };
    });
    const verdictAlways = cases.every((c) => c.ok !== null);
    const line = verdictAlways
      ? `「${key}」で数えると、どんな差でも はい／いいえ が出ます。`
      : `「${key}」で数えると、${unknown.length}つの分からない所が残るので、` +
        "差が説明のつく範囲からはみ出したときに『言えません』になります" +
        `（${unknown.join("／") || "名前は出ていません"}）。`;
    return {
      key,
      unknownLabels: unknown,
      named: base.named,
      namedLabels: base.namedLabels,
      cases,
      verdictAlways,
      line,
    };
  });

  // ★「ぜんぶ答えた」は2通りあります（日当をお渡ししたか・まだか）。
  //   **どちらを えらんでも合否が出る**ときだけ「1分は実る」と言います。
  const answered = outcomes.filter((o) => o.key.startsWith("ぜんぶ答えた"));
  const worthThePress = answered.length > 0 && answered.every((o) => o.verdictAlways);
  const summary = worthThePress
    ? "いま金庫を1分 数えて、出てくる3つの問いにぜんぶ答えてもらえば、" +
      "**どんな差が出ても はい／いいえ が出ます**（1分は実ります）。" +
      "日当を［もうお渡しした］［まだです］の どちらで えらんでも答えが出ます。" +
      (outcomes.find((o) => o.key === "銀行に入れたと答えた")?.verdictAlways
        ? ""
        : "ただし［銀行に入れました］をえらぶと、いくら入れたかの置き場が倉庫に無いので、" +
          "差が大きいときは『言えません』になります（金額を記録する置き場ができるまでは、" +
          "そこだけは答えが出ません）。")
    : "いま数えてもらっても、分からない所が残るので『言えません』になることがあります" +
      "（1分を頼む前に、ここを閉じます）。";

  return { measurable: true, outcomes, worthThePress, summary, note: NOTE, howto: HOWTO };
}
