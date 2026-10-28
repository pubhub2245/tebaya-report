/**
 * 「数え始めの日より前に払った経費」を数えるところ（2026-10-28・kp265・f1-4）。
 * **計算だけ**（倉庫は触りません・金額は1円も作りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   月の経費は「その月ぜんぶ」を数えます（9月なら 9/1〜9/30）。
 *   いっぽう「今の現金」は **数え始めの日から** しか数えません
 *   （手羽屋の数え始めは 2026-09-10・145,000円）。
 *   ＝ **数え始めの日より前に払った経費は、月の経費には入るのに、現金からは引かれません。**
 *   手羽屋の9月では、9/4・9/7・9/8・9/9 の仕入4件（合わせて 47,520円）がこれに当たります。
 *
 *   この分を現金で払っていたなら、じゅんが金庫を数えたときに
 *   **画面の現金と金庫が その分だけズレます**。ところが画面は
 *   「金庫のほうが◯◯円 少ないです。書き忘れた現金の支払いを見てください」と言うので、
 *   **書き忘れが1件も無いのに探し物をさせてしまいます**。
 *   そこで、差の内わけとして「数え始めの日より前の経費」を1行 出します。
 *
 * ■ ここでしないこと（大事）
 *   ① 金額をこちらで直しません。**月の経費・1枚の要約・会計ソフト向けCSVは1円も変えません**
 *      （変えると f1-2・f1-5 の合格が崩れます）。出すのは説明の1行だけです。
 *   ② 決め打ちの金額を書きません。件数も金額も、そのとき読んだ日報から数えます。
 *   ③ 当てはまる行が無い月は、行そのものを出しません（よけいな行を増やさない）。
 *
 * ■ 数えるのは「金庫から出た分」だけ
 *   立替・現金以外（PayPay・プリカ）は、そもそも金庫から出ていないので
 *   数え始めの前でも後でもズレの理由になりません（lib/keiri/cashMeans.ts と同じ見分け方）。
 *   参考として、その分の件数と金額は別に持ちます（画面には出しません）。
 */

import { amountOf, expenseItemsOf } from "./classify";
import { classifyCashMeans } from "./cashMeans";
import { NEAR_ENOUGH_YEN, monthDay } from "./cashCheck";
import type { KeiriReport } from "./types";

export type CashOpeningGap = {
  /** 金庫から出た分の件数（数え始めの日より前） */
  count: number;
  /** 金庫から出た分の合計（数え始めの日より前） */
  total: number;
  /** 立替・現金以外の件数（金庫から出ていないので、ズレの理由にならない） */
  otherCount: number;
  /** 立替・現金以外の合計 */
  otherTotal: number;
  /** いちばん古い日（金庫から出た分だけ・無ければ null） */
  firstDate: string | null;
  /** いちばん新しい日（金庫から出た分だけ・無ければ null） */
  lastDate: string | null;
};

export const EMPTY_CASH_OPENING_GAP: CashOpeningGap = {
  count: 0,
  total: 0,
  otherCount: 0,
  otherTotal: 0,
  firstDate: null,
  lastDate: null,
};

/** 円の書き方（画面と同じ3桁区切り） */
function yen(n: number): string {
  return `${Math.round(n).toLocaleString("ja-JP")}円`;
}

/**
 * 「数え始めの日より前の経費」を数える。
 *
 * @param reports     読めている日報（その月ぶん。数え始めより前の日も入っている）
 * @param openingDate 経理の数え始めの日（keiri_settings の opening_date）
 */
export function expensesBeforeOpening(params: {
  reports: KeiriReport[];
  openingDate: string | null | undefined;
}): CashOpeningGap {
  const opening = String(params.openingDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opening)) return { ...EMPTY_CASH_OPENING_GAP };

  const out: CashOpeningGap = { ...EMPTY_CASH_OPENING_GAP };
  for (const r of params.reports ?? []) {
    const date = typeof r?.date === "string" ? r.date.slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    // ★「数え始めの日より前」だけ。数え始めの日そのものは現金に入っているので数えない
    if (date >= opening) continue;
    for (const item of expenseItemsOf(r.expenses)) {
      const amount = amountOf(item);
      if (amount === 0) continue;
      if (classifyCashMeans(item) === "cash") {
        out.count += 1;
        out.total += amount;
        if (!out.firstDate || date < out.firstDate) out.firstDate = date;
        if (!out.lastDate || date > out.lastDate) out.lastDate = date;
      } else {
        out.otherCount += 1;
        out.otherTotal += amount;
      }
    }
  }
  out.total = Math.round(out.total);
  out.otherTotal = Math.round(out.otherTotal);
  return out;
}

/** 「いつからいつまで」の書き方（1日だけなら1つだけ出す） */
function spanOf(gap: CashOpeningGap): string {
  if (!gap.firstDate) return "";
  if (!gap.lastDate || gap.lastDate === gap.firstDate) return monthDay(gap.firstDate);
  return `${monthDay(gap.firstDate)}〜${monthDay(gap.lastDate)}`;
}

/** 差を、この分が説明しきれるか */
export type CashOpeningGapFit = "exact" | "near" | "no";

/**
 * 「金庫のほうが少ない」差が、数え始めの日より前の経費でちょうど説明できるかを見る。
 *
 * @param diff 計算上の残高 − 数えた金額（プラス＝金庫のほうが少ない）
 */
export function cashOpeningGapFit(
  gap: CashOpeningGap,
  diff: number | null,
): CashOpeningGapFit {
  if (gap.count === 0 || diff === null || !Number.isFinite(diff)) return "no";
  // 金庫が多いとき（マイナス）は、この分では説明できない（払った分は現金を減らす側）
  if (diff <= 0) return "no";
  const rest = Math.abs(diff - gap.total);
  if (rest === 0) return "exact";
  return rest < NEAR_ENOUGH_YEN ? "near" : "no";
}

/**
 * 差の内わけとして出す行（当てはまる行が無ければ空）。
 *
 * @param diff 計算上の残高 − 数えた金額（渡さなければ、説明の1行だけ出す）
 */
export function cashOpeningGapLines(
  gap: CashOpeningGap,
  diff?: number | null,
): string[] {
  if (gap.count === 0) return [];
  const span = spanOf(gap);
  const lines = [
    `数え始めの日より前に払った経費　${yen(gap.total)}（${gap.count}件${span ? `・${span}` : ""}）`,
    // ★言い切りません（どちらなのかは、数え始めの金額を数えたときの中身で決まります）。
    //   こちらで決めつけると、無い探し物をさせるか、逆に見逃させてしまいます。
    "この分は月の経費には入っていますが、数え始めの日より前なので、現金からは引いていません。" +
      "数え始めの金額を数えたときに、この支払いがもう済んでいたなら差にはなりません。" +
      "まだ金庫に残っていた（あとから現金で払った）なら、その分だけ金庫が少なくなります。",
  ];
  const fit = cashOpeningGapFit(gap, diff ?? null);
  if (fit === "exact") {
    lines.push(
      `差 ${yen(Math.abs(diff ?? 0))} は、この${gap.count}件とぴったり同じ金額です。` +
        `まずこの${gap.count}件を確かめてください（ほかを探す前に、ここだけで説明がつきます）。`,
    );
  } else if (fit === "near") {
    lines.push(
      `差 ${yen(Math.abs(diff ?? 0))} は、この${gap.count}件とほぼ同じ金額です` +
        `（ちがいは ${yen(Math.abs((diff ?? 0) - gap.total))}）。まずこの${gap.count}件を確かめてください。`,
    );
  }
  return lines;
}

/**
 * 外から確かめる窓口に返す形（2026-10-28・kp265・f1-4）。
 * **金額は1円も返しません。** 返すのは件数・日付・説明がつくかどうかだけです。
 */
export type CashOpeningGapWindow = {
  /** 金庫から出た分の件数（数え始めの日より前） */
  count: number;
  /** 立替・現金以外の件数（ズレの理由にならない分） */
  otherCount: number;
  firstDate: string | null;
  lastDate: string | null;
  /** 差をこの分で説明できるか */
  fit: CashOpeningGapFit;
  /** 画面に行が出るか（＝差が出ていて、当てはまる行がある） */
  shown: boolean;
  /** ひとこと（金額は入れない） */
  note: string;
};

export function buildCashOpeningGapWindow(params: {
  gap: CashOpeningGap;
  /** 計算上の残高 − 数えた金額（まだ数えていなければ null） */
  diff: number | null;
}): CashOpeningGapWindow {
  const { gap, diff } = params;
  const fit = cashOpeningGapFit(gap, diff);
  const hasDiff = diff !== null && Math.abs(diff) >= NEAR_ENOUGH_YEN;
  const shown = gap.count > 0 && hasDiff;
  const note =
    gap.count === 0
      ? "数え始めの日より前に払った経費はありません（この行は出ません）。"
      : fit === "exact"
        ? `差は、数え始めの日より前に払った経費 ${gap.count}件 とぴったり同じ金額です。`
        : fit === "near"
          ? `差は、数え始めの日より前に払った経費 ${gap.count}件 とほぼ同じ金額です。`
          : hasDiff
            ? `数え始めの日より前に払った経費が ${gap.count}件 あります（差の説明にはなりません）。`
            : `数え始めの日より前に払った経費が ${gap.count}件 あります（いまは差が出ていないので、行は出ません）。`;
  return {
    count: gap.count,
    otherCount: gap.otherCount,
    firstDate: gap.firstDate,
    lastDate: gap.lastDate,
    fit,
    shown,
    note,
  };
}

/**
 * この分で差が説明ついたか（＝「よくある原因を探してください」と言わないほうがよいか）。
 * ★数え方のちがい（lib/keiri/cashVariant.ts）と同じ考え方です。
 */
export function cashOpeningGapExplains(
  gap: CashOpeningGap,
  diff: number | null,
): boolean {
  return cashOpeningGapFit(gap, diff) !== "no";
}

/**
 * 「よくある原因3つ」を出すかどうかを、1か所で決める（2026-10-28・kp265・f1-4）。
 *
 * ■ なぜ1か所にするのか
 *   差の理由が先に分かっているときに「書き忘れを探してください」と出すと、
 *   **無い探し物をさせてしまいます**。その決め方が画面と筋書き（外から確かめる窓口）に
 *   2つあると、画面では出ないのに窓口では出る、という食い違いが起きます。
 *   ここを通れば、どちらも同じ答えになります。
 */
export function diffCausesToShow(params: {
  /** cashDiffCauses が出した3つ（差が小さければ空） */
  causes: readonly string[];
  /** 数え方のちがいで説明がついたか（lib/keiri/cashVariant.ts） */
  variantMatched: boolean;
  gap: CashOpeningGap;
  /** 計算上の残高 − 数えた金額 */
  diff: number | null;
}): readonly string[] {
  if (params.variantMatched) return [];
  if (cashOpeningGapExplains(params.gap, params.diff)) return [];
  return params.causes;
}
