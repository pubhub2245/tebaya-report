/**
 * 「金庫を数えた金額と、計算上の現金を突き合わせる所が正しく動くか」を、
 * **架空のお店の数字で外から確かめる**ための筋書き（kp233・f1-4）。
 *
 * ■ なぜ要るか（やさしい説明）
 *   突き合わせる仕組みそのものは、もう本物の経理画面（/keiri）と
 *   お試し版（/keiri/demo）の両方に入っています。ところが、
 *   **どちらも「金額を入れて［この金額で比べる］を押す」必要があります。**
 *   検査役（B2）が使う読み取りの道具はボタンを押せないので、
 *   2026-10-09 18:55 の検査でこう書かれました——
 *   「差の言葉や原因3つが正しく出るかは確かめられていません」。
 *   ＝ 仕組みが正しいかどうかを、外から一度も確かめられていない状態でした。
 *
 * ■ そこでやること
 *   架空のお店（お試し版と同じ数字）の「計算上の現金」に対して、
 *   **本物と同じ関数**（previewCashCount・reconcileLines・cashDiffCauses）で
 *   6通りを計算し、出てくる言葉と金額をそのまま並べます：
 *     ① ぴったり合う ② ほぼ合う（1,000円 未満のズレ）
 *     ③ 金庫のほうが少ない ④ 金庫のほうが多い
 *     ⑤ まだ1回も数えていない ⑥ 久しく数えていない（30日以上）
 *   そのうえで、言葉と数字のつじつまが合っているかを自分で検算し `ok` で返します。
 *
 * ★倉庫には1行も書き込みません（棚が無くても動きます）。
 * ★出る金額はすべて架空のお店のもので、手羽屋の実データは1円も入りません。
 */

import { calcCashPosition, type CashPosition } from "./aggregate";
import {
  DIFF_CAUSES,
  NEAR_ENOUGH_YEN,
  STALE_DAYS,
  cashDiffCauses,
  cashRuleLines,
  diffDirection,
  notFromSafeSentence,
  previewCashCount,
  reconcileCash,
  reconcileLines,
  type CashReconcile,
} from "./cashCheck";
import {
  DEMO_SHOP_NAME,
  demoAdvances,
  demoPayments,
  demoReports,
  demoSettings,
} from "./demo";

/** 架空のお店の月（お試し版と同じ数字が出るように固定する） */
export const CASH_CHECK_YM = "2026-09";

/** 突き合わせる日（＝数えた日）。この日までの計算上の残高と比べる */
export const CASH_CHECK_COUNTED_ON = `${CASH_CHECK_YM}-30`;

/**
 * 「久しく数えていない」を試すための、ずっと前に数えた日。
 * ★数え始めの日（月の頭）より後にしてある（前にすると「数え始め前の残高」と
 *   比べることになり、画面に出ない場面になってしまう）。
 */
export const CASH_CHECK_STALE_ON = `${CASH_CHECK_YM}-05`;

/** ③で使うズレ（1,000円 以上＝原因を出す側） */
const SHORT_BY = 3576;
/** ④で使うズレ（金庫のほうが多い側） */
const OVER_BY = 12000;
/** ②で使うズレ（1,000円 未満＝おつりの誤差の範囲） */
const NEAR_BY = 500;

/** 架空のお店の現金の様子（お試し版とまったく同じ作り方） */
export function cashCheckPosition(asOf: string = CASH_CHECK_COUNTED_ON): CashPosition {
  const ym = CASH_CHECK_YM;
  return calcCashPosition({
    reports: demoReports(ym),
    payments: demoPayments(),
    settings: demoSettings(ym),
    advances: demoAdvances(ym),
    asOf,
  });
}

export type CashCheckCase = {
  /** その場面の名前（検査役がそのまま読む） */
  name: string;
  /** 数えた日 */
  countedOn: string;
  /** 計算上の現金（数えた日の時点） */
  computed: number | null;
  /** 数えたことにした金額 */
  counted: number | null;
  /** 計算 − 実測。プラス＝金庫のほうが少ない */
  diff: number | null;
  /** 差の向きの言葉（ぴったり／金庫のほうが少ない／多い） */
  direction: string | null;
  /** 画面に出る3行（計算上・実際・差） */
  lines: string[];
  /** 差の言い方（1文） */
  verdict: string;
  /** 差が大きいときだけ出る、よくある原因 */
  causes: readonly string[];
  /** 「久しく数えていません」の一言（当てはまらなければ null） */
  stale: string | null;
};

/** 1場面ぶんを、本物と同じ関数で作る */
function caseOf(params: {
  name: string;
  r: CashReconcile;
  countedOn: string;
}): CashCheckCase {
  const { name, r, countedOn } = params;
  return {
    name,
    countedOn,
    computed: r.computed,
    counted: r.counted,
    diff: r.diff,
    direction: r.diff === null ? null : diffDirection(r.diff),
    // ★画面と同じ関数で作る（ここに文を書き写さない）
    lines: reconcileLines(r),
    verdict: r.verdict,
    causes: cashDiffCauses(r),
    stale: r.stale,
  };
}

export type CashCheckResult = {
  what: string;
  shopName: string;
  ym: string;
  /** 計算上の現金は、こう数えています（画面と同じ明細） */
  howComputed: string[];
  /** 金庫から出ていないので引いていないもの（無ければ null） */
  notFromSafe: string | null;
  /** 1,000円 未満は「ほぼ合っている」とする線 */
  nearEnoughYen: number;
  /** 何日 数えていなければ「久しく数えていない」と言うか */
  staleDays: number;
  /** 差が大きいときに出す原因の一覧（画面に出るものと同じ） */
  causeList: readonly string[];
  cases: CashCheckCase[];
  /** 言葉と数字のつじつまが合っているか（検算の結果） */
  ok: boolean;
  /** 合っていなかったところ（ok が true なら空） */
  problems: string[];
  note: string;
};

/**
 * 外から確かめる窓口の中身を作る。
 *
 * @param countedYen 検査役が自分で金額を指定したいとき（?counted=…）。架空のお店に対して試す
 * @param today 今日（YYYY-MM-DD）。「久しく数えていない」の判定に使う
 */
export function buildCashCheck(params?: {
  countedYen?: number | null;
  today?: string;
}): CashCheckResult {
  const today = params?.today ?? new Date().toISOString().slice(0, 10);
  const pos = cashCheckPosition();
  const computed = pos.balance;

  const preview = (counted: number, countedOn = CASH_CHECK_COUNTED_ON): CashReconcile =>
    previewCashCount({
      computedAtCount: cashCheckPosition(countedOn).balance,
      countedOn,
      counted,
      today,
    });

  const cases: CashCheckCase[] = [
    caseOf({
      name: "① ぴったり合う",
      r: preview(computed),
      countedOn: CASH_CHECK_COUNTED_ON,
    }),
    caseOf({
      name: `② ほぼ合う（${NEAR_BY.toLocaleString("ja-JP")}円 のズレ＝おつりの誤差の範囲）`,
      r: preview(computed - NEAR_BY),
      countedOn: CASH_CHECK_COUNTED_ON,
    }),
    caseOf({
      name: `③ 金庫のほうが少ない（${SHORT_BY.toLocaleString("ja-JP")}円）`,
      r: preview(computed - SHORT_BY),
      countedOn: CASH_CHECK_COUNTED_ON,
    }),
    caseOf({
      name: `④ 金庫のほうが多い（${OVER_BY.toLocaleString("ja-JP")}円）`,
      r: preview(computed + OVER_BY),
      countedOn: CASH_CHECK_COUNTED_ON,
    }),
    caseOf({
      name: "⑤ まだ1回も数えていない",
      r: reconcileCash({ events: [], computedAtCount: computed, today }),
      countedOn: "",
    }),
    caseOf({
      name: `⑥ 久しく数えていない（${CASH_CHECK_STALE_ON} に数えたまま）`,
      r: reconcileCash({
        events: [
          { kind: "count", happened_on: CASH_CHECK_STALE_ON, amount: 120000 },
        ],
        computedAtCount: cashCheckPosition(CASH_CHECK_STALE_ON).balance,
        today,
      }),
      countedOn: CASH_CHECK_STALE_ON,
    }),
  ];

  if (params?.countedYen !== null && params?.countedYen !== undefined) {
    const asked = Math.max(0, Math.round(params.countedYen));
    cases.push(
      caseOf({
        name: `⑦ 指定された金額で試す（${asked.toLocaleString("ja-JP")}円）`,
        r: preview(asked),
        countedOn: CASH_CHECK_COUNTED_ON,
      }),
    );
  }

  const problems = checkCases(cases);

  return {
    what:
      "金庫を数えた金額と、計算上の現金を突き合わせる所が正しく動くか（f1-4）。" +
      "ボタンを押さずに、外から読むだけで確かめられます",
    shopName: DEMO_SHOP_NAME,
    ym: CASH_CHECK_YM,
    howComputed: cashRuleLines({
      openingDate: pos.openingDate,
      openingBalance: pos.openingBalance,
      sales: pos.sales,
      expensesCash: pos.expenseMeans.cash,
      paid: pos.paid,
      advancesSettled: pos.advancesSettled,
      deposits: pos.deposits,
      balance: pos.balance,
    }),
    notFromSafe: notFromSafeSentence({
      advance: pos.expenseMeans.advance,
      advanceCount: pos.expenseMeans.advanceCount,
      noncash: pos.expenseMeans.noncash,
      noncashCount: pos.expenseMeans.noncashCount,
    }),
    nearEnoughYen: NEAR_ENOUGH_YEN,
    staleDays: STALE_DAYS,
    causeList: DIFF_CAUSES,
    cases,
    ok: problems.length === 0,
    problems,
    note:
      "架空のお店（お試し版と同じ数字）です。手羽屋の実データ・お店の名前・連絡先・鍵の値は1文字も入っていません。" +
      "倉庫には1行も書き込みません。?counted=123456 を付けると、その金額でも試せます。" +
      "古い答えが返るときは ?v=いまの時刻 を付けて開き直してください。",
  };
}

/**
 * 言葉と数字のつじつまを、こちらで検算する（検査役が目で数えなくてよいように）。
 *
 * 見るのは4つだけ：
 *   ・差＝計算上 − 数えた（1円でも違えば不合格）
 *   ・差の向きの言葉が、符号と合っているか
 *   ・原因3つは、1,000円 以上のときだけ出ているか
 *   ・3行（計算上・実際・差）が、数えた場面では必ず出ているか
 */
export function checkCases(cases: CashCheckCase[]): string[] {
  const problems: string[] = [];
  for (const c of cases) {
    if (c.computed !== null && c.counted !== null) {
      if (c.diff !== c.computed - c.counted) {
        problems.push(`${c.name}：差が「計算上 − 数えた」になっていません`);
      }
      if (c.lines.length !== 3) {
        problems.push(`${c.name}：画面に出る3行がそろっていません`);
      }
      const want =
        c.diff === 0 ? "ぴったり" : (c.diff ?? 0) > 0 ? "金庫のほうが少ない" : "金庫のほうが多い";
      if (c.direction !== want) {
        problems.push(`${c.name}：差の向きの言葉が符号と合っていません`);
      }
      const big = Math.abs(c.diff ?? 0) >= NEAR_ENOUGH_YEN;
      if (big && c.causes.length !== DIFF_CAUSES.length) {
        problems.push(`${c.name}：差が大きいのに、よくある原因が出ていません`);
      }
      if (!big && c.causes.length !== 0) {
        problems.push(`${c.name}：差が小さいのに、よくある原因が出ています`);
      }
    } else if (c.causes.length !== 0 || c.lines.length !== 0) {
      problems.push(`${c.name}：数えていないのに、差や原因が出ています`);
    }
    if (!c.verdict) problems.push(`${c.name}：差の言い方が空です`);
  }
  return problems;
}
