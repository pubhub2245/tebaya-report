/**
 * 「現場スタッフが立て替えた分を、お返ししたときの現金」を数えるところ
 * （2026-11-04・f1-4）。**計算だけ**（倉庫は触りません・金額は1円も作りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   立替（たてかえ）＝ だれかが**自分のお財布から先に払った**経費です。入り口は2つあります
 *   （CLAUDE.md 5-4）。
 *     ・現場スタッフぶん … /keiri/advances（棚 keiri_advance_expenses）
 *     ・経営側ぶん　　　 … /cash/advances（棚 advance_expenses）
 *
 *   立て替えた日は、お店の金庫からお金が出ていません（出したのはその人のお財布）。
 *   **お返しした日に、はじめて金庫からお金が出ます。**
 *   画面の「計算上の現金」も、そのとおり「**返した立替**」だけを引いています。
 *
 *   ところが **現場スタッフぶんの棚には「お返しした」という記録を残す欄がそもそもありません**
 *   （CLAUDE.md 5-4 の残課題。lib/keiri/advances.ts の normalizeFieldAdvance は
 *   settled を必ず false にしています＝「返した」と言える材料が1つも無いため）。
 *   ＝ **現場スタッフにお返ししても、計算上の現金はいつまでも減りません。**
 *
 *   じゅんが金庫を1分 数えると、お返しした分だけ **金庫のほうが少なく** 出ます。
 *   それなのに画面は「金庫のほうが◯◯円 少ないです。書き忘れた現金の支払いを見てください」
 *   としか言わないので、**書き忘れが1件も無いのに探し物をさせてしまいます**
 *   （レジに残したつり銭・日報の空き・レジの過不足と同じ筋で、これが4件目です）。
 *
 * ■ ここでしないこと（大事）
 *   ① **金額を直しません。** 「今の現金」も、月の経費・利益・1枚の要約・
 *      会計ソフト向けCSV・試算表も **1円も変えません**（変えると f1-2・f1-5・f1-7 の
 *      合格が崩れます）。出すのは説明の行だけです。
 *      ※「お返しした」を記録できるようにして現金から引く、というのは
 *        **現金残高の決め方そのものを変える話**なので、こちらでは決めません
 *        （CLAUDE.md 5-4「直すときは現金残高の計算に触ることになるので、必ず事前に相談する」）。
 *        **まず名前を付けて見えるようにするところまで**です。
 *   ② **「お返し済みだ」と決めつけません。** 記録が無いので、こちらには分かりません。
 *      言えるのは「この◯件のうち、お返しした分だけ金庫が少なくなる」＝
 *      **上限（合計）の中に差が収まるか**までです。
 *   ③ 合否（合っている／合っていない）の決め方は1文字も変えません。
 *      「よくある原因3つ」を出すかどうかも変えません（lib/keiri/cashOpeningGap.ts の
 *      diffCausesToShow はそのままです）。記録が無い＝言い切れないので、
 *      ここで原因探しを止めてしまうと、本当の書き忘れを見逃させます。
 *
 * ■ 経営側ぶん（advance_expenses）はここでは数えません
 *   あちらには「返した／返した日」の欄があり、画面の現金はすでにその日に引いています
 *   （lib/keiri/aggregate.ts の advancesSettled）。数え方が2通りに分かれる話は
 *   lib/keiri/cashVariant.ts・advanceRange.ts が受け持っています。
 *
 * ■ 読めなかったときは「0件」と言いません
 *   立替の棚は、よそのお店として開いているときや倉庫が落ちているときに読めません。
 *   読めたかどうかを必ず持ち、読めていなければ説明の行は1行も出しません。
 */

import { NEAR_ENOUGH_YEN, monthDay } from "./cashCheck";
import type { KeiriAdvance } from "./types";

export type FieldRepayGap = {
  /** 立替の棚を読めたか（**0件と取り違えないため**） */
  readable: boolean;
  /** お返しした記録を残せない現場の立替の件数（数え始めの日から、数えた日まで） */
  rows: number;
  /** その合計（＝お返しした分の**上限**。これより多く金庫から出ることはない） */
  total: number;
  /** いちばん古い日（1件も無ければ null） */
  firstDate: string | null;
  /** いちばん新しい日（1件も無ければ null） */
  lastDate: string | null;
};

export const EMPTY_FIELD_REPAY_GAP: FieldRepayGap = {
  readable: false,
  rows: 0,
  total: 0,
  firstDate: null,
  lastDate: null,
};

/** その文字列が YYYY-MM-DD の形をしているか */
function isYmd(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** 円の表示（画面と同じ3桁区切り） */
function yen(n: number): string {
  return `${Math.abs(Math.round(n)).toLocaleString("ja-JP")}円`;
}

/** 「◯件」 */
function rowsLabel(rows: number): string {
  return rows === 1 ? "1件" : `${rows}件`;
}

/** 「いつからいつまで」（1日だけなら1つだけ出す） */
function spanOf(gap: FieldRepayGap): string {
  if (!gap.firstDate) return "";
  if (!gap.lastDate || gap.lastDate === gap.firstDate) return monthDay(gap.firstDate);
  return `${monthDay(gap.firstDate)}〜${monthDay(gap.lastDate)}`;
}

/**
 * 現場スタッフの立替のうち、「お返ししたら金庫から出るのに、引けていない」分を数える。
 *
 * @param advances    読めている立替（現場・経営の両方が混ざっていてよい）
 * @param unreadable  立替の棚が読めなかったか（読めていないなら 0件 と言わない）
 * @param openingDate 経理の数え始めの日。これより前に立て替えた分は、数えた残高の中身が
 *                    分からないので数えない（lib/keiri/cashOpeningGap.ts と同じ考え方）
 * @param asOf        数えた日（まだ数えていなければ今日）。この日より後に立て替えた分は、
 *                    その日までにお返しできないので数えない
 */
export function measureFieldRepayGap(params: {
  advances: readonly KeiriAdvance[] | null | undefined;
  unreadable?: boolean;
  openingDate: string;
  asOf: string;
}): FieldRepayGap {
  if (params.unreadable || !params.advances) return { ...EMPTY_FIELD_REPAY_GAP };
  const from = String(params.openingDate ?? "").slice(0, 10);
  const asOf = String(params.asOf ?? "").slice(0, 10);

  const out: FieldRepayGap = { ...EMPTY_FIELD_REPAY_GAP, readable: true };
  for (const a of params.advances) {
    if (!a) continue;
    // 現場スタッフぶんだけ（経営側は「返した日」で画面がもう引いている）
    if (a.source !== "field") continue;
    // 経費として数えない種類は、現金の式でも数えていない（aggregate.ts と同じ見分け方）
    if (a.skipReason) continue;
    const date = typeof a.date === "string" ? a.date.slice(0, 10) : "";
    if (!isYmd(date)) continue;
    if (isYmd(from) && date < from) continue;
    if (isYmd(asOf) && date > asOf) continue;
    const amount = Math.round(Number(a.amount) || 0);
    if (amount === 0) continue;
    out.rows += 1;
    out.total += amount;
    if (!out.firstDate || date < out.firstDate) out.firstDate = date;
    if (!out.lastDate || date > out.lastDate) out.lastDate = date;
  }
  return out;
}

/** 差を、この分がどこまで説明できるか */
export type FieldRepayFit =
  /** 合計とぴったり同じ（＝ぜんぶお返ししていれば説明がつく） */
  | "exact"
  /** 合計とほぼ同じ（ちがいは1,000円未満） */
  | "near"
  /** 合計より小さい（＝一部をお返ししていれば説明がつく） */
  | "within"
  /** この分では説明がつかない */
  | "no";

/**
 * 「金庫のほうが少ない」差が、この分でどこまで説明できるかを見る。
 *
 * @param diff 計算上の残高 − 数えた金額（プラス＝金庫のほうが少ない）
 */
export function fieldRepayFit(gap: FieldRepayGap, diff: number | null): FieldRepayFit {
  if (!gap.readable || gap.rows === 0) return "no";
  if (diff === null || !Number.isFinite(diff)) return "no";
  // 金庫のほうが多いとき（マイナス）は、この分では説明できない
  //（お返しは現金を減らす側なので、増える向きの説明にはならない）
  if (diff <= 0) return "no";
  const rest = Math.abs(diff - gap.total);
  if (rest === 0) return "exact";
  if (rest < NEAR_ENOUGH_YEN) return "near";
  return diff < gap.total ? "within" : "no";
}

/** この分の説明の1行目（金額と件数の事実だけ） */
function factLine(gap: FieldRepayGap): string {
  const span = spanOf(gap);
  return (
    `現場スタッフが立て替えた分が ${rowsLabel(gap.rows)}（合計 ${yen(gap.total)}` +
    `${span ? `・${span}` : ""}）あります。`
  );
}

/** この分の説明の2行目（なぜ差になるのか） */
const WHY_LINE =
  "お返しした日に金庫からお金が出ますが、現場スタッフぶんの立替には" +
  "「お返しした」という記録を残す欄がまだ無いので、上の「計算上の現金」からは引いていません。" +
  "お返しした分があれば、そのぶん金庫のほうが少なく出ます（書き忘れではありません）。" +
  "まだお返ししていなければ、差にはなりません。";

/**
 * 差の内わけとして出す行（当てはまらなければ空）。
 *
 * @param diff 計算上の残高 − 数えた金額（渡さなければ、差が無いものとして扱う）
 */
export function fieldRepayGapLines(
  gap: FieldRepayGap,
  diff?: number | null,
): string[] {
  if (!gap.readable || gap.rows === 0) return [];
  const d = diff ?? null;
  const hasDiff = d !== null && Number.isFinite(d) && Math.abs(d) >= NEAR_ENOUGH_YEN;
  if (!hasDiff) return [];
  const fit = fieldRepayFit(gap, d);
  // 金庫のほうが多い側（マイナス）のときは、この分の話ではないので出さない
  if (fit === "no" && (d as number) <= 0) return [];
  const lines = [factLine(gap), WHY_LINE];
  if (fit === "exact") {
    lines.push(
      `差 ${yen(d as number)} は、この${rowsLabel(gap.rows)}の合計とぴったり同じ金額です。` +
        `まず、この${rowsLabel(gap.rows)}をもうお返ししたかどうかを確かめてください` +
        "（ほかを探す前に、ここだけで説明がつきます）。",
    );
  } else if (fit === "near") {
    lines.push(
      `差 ${yen(d as number)} は、この${rowsLabel(gap.rows)}の合計とほぼ同じ金額です` +
        `（ちがいは ${yen((d as number) - gap.total)}）。` +
        `まず、この${rowsLabel(gap.rows)}をもうお返ししたかどうかを確かめてください。`,
    );
  } else if (fit === "within") {
    lines.push(
      `差 ${yen(d as number)} は、この合計 ${yen(gap.total)} の中に収まります。` +
        "お返しした分がこの中にあるかどうかを先に確かめてください" +
        "（どの行をお返ししたかは記録が無いので、こちらでは決められません）。",
    );
  } else {
    lines.push(
      `ただし差 ${yen(d as number)} は、この合計 ${yen(gap.total)} より大きいので、` +
        "この分だけでは説明がつきません。ほかにも理由があります。",
    );
  }
  return lines;
}

/**
 * 数える前に出す一言（当てはまらなければ空）。
 *
 * ★数えたあとに言っても1分は戻らないので、押す前に出します。止めはしません。
 */
export function fieldRepayGapNotice(gap: FieldRepayGap): string {
  if (!gap.readable || gap.rows === 0) return "";
  return (
    factLine(gap) +
    "お返しした日に金庫からお金が出ますが、その記録を残す欄がまだ無いので、" +
    "計算上の現金からは引いていません。もうお返ししている分があると、" +
    `そのぶん（多くても ${yen(gap.total)}）金庫のほうが少なく出ます。`
  );
}

/**
 * 外から確かめる窓口に返す形（2026-11-04・f1-4）。
 * **本物の金額は1円も返しません**（lib/keiri/checkWindow.ts の決まり③）。
 * 返すのは「読めたか・何件か・日付・説明がどこまでつくか・行が出るか」だけです。
 */
export type FieldRepayGapWindow = {
  /** 立替の棚を読めたか */
  readable: boolean;
  /** お返しした記録を残せない現場の立替の件数 */
  rows: number;
  firstDate: string | null;
  lastDate: string | null;
  /** 差をこの分でどこまで説明できるか */
  fit: FieldRepayFit;
  /** 画面に差の内わけの行が出るか（＝差が1,000円以上で、当てはまる行がある） */
  shown: boolean;
  /** ひとこと（金額は入れない） */
  note: string;
};

export function buildFieldRepayGapWindow(params: {
  gap: FieldRepayGap;
  /** 計算上の残高 − 数えた金額（まだ数えていなければ null） */
  diff: number | null;
}): FieldRepayGapWindow {
  const { gap, diff } = params;
  const fit = fieldRepayFit(gap, diff);
  const hasDiff = diff !== null && Number.isFinite(diff) && Math.abs(diff) >= NEAR_ENOUGH_YEN;
  const shown =
    gap.readable && gap.rows > 0 && hasDiff && !(fit === "no" && (diff as number) <= 0);
  const note = !gap.readable
    ? "立替の棚が読めていません（0件という意味ではありません。この行は出ません）。"
    : gap.rows === 0
      ? "数え始めの日からあと、現場スタッフの立替は1件も入っていません（この行は出ません）。"
      : fit === "exact"
        ? `差は、現場スタッフの立替 ${gap.rows}件 の合計とぴったり同じ金額です。`
        : fit === "near"
          ? `差は、現場スタッフの立替 ${gap.rows}件 の合計とほぼ同じ金額です。`
          : fit === "within"
            ? `差は、現場スタッフの立替 ${gap.rows}件 の合計の中に収まります。`
            : hasDiff && (diff as number) > 0
              ? `現場スタッフの立替が ${gap.rows}件 あります（差のほうが大きく、この分だけでは説明がつきません）。`
              : hasDiff
                ? `現場スタッフの立替が ${gap.rows}件 ありますが、金庫のほうが多い側の差なので、この分の話ではありません。`
                : `現場スタッフの立替が ${gap.rows}件 あります（いまは差が出ていないので、行は出ません）。`;
  return {
    readable: gap.readable,
    rows: gap.rows,
    firstDate: gap.firstDate,
    lastDate: gap.lastDate,
    fit,
    shown,
    note,
  };
}
