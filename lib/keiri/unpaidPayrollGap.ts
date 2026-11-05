/**
 * 「日当（にっとう）のうち、まだ『払った』という記録が無い分」を数えるところ
 * （2026-11-05・f1-4）。**計算だけ**（倉庫は触りません・金額は1円も作りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   「計算上の現金」の足し引きは、いまこの6つだけです
 *   （lib/keiri/aggregate.ts の calcCashPosition）：
 *     数え始めの現金 ＋ 売上 − 金庫から出た経費 − 払った給与・外注費・家賃
 *     − 返した立替 − 銀行に入れた分
 *
 *   このうち「払った給与」は、**払った記録（棚 keiri_payments の kind='payroll'）が
 *   ある分だけ**です。日報に入っている日当（daily_reports.labor）は、
 *   「まだ払っていないお金」（lib/keiri/aggregate.ts の calcUnpaid）として
 *   **別に置いてあり、現金からは引いていません。**
 *
 *   この数え方そのものは正しいです。まだ払っていないお金は、まだ金庫に残っています。
 *   ところが **払った記録を1件も付けずに、金庫のお金からお渡ししていると、
 *   そのぶんだけ金庫のほうが少なく出ます。**
 *   日当は営業日ごとに付くので、ここは **ほかの内わけよりずっと大きくなりえます**
 *   （26営業日ぶんなら、桁がひとつ上がります）。
 *
 *   それなのに、いまの画面は「金庫のほうが◯◯円 少ないです。書き忘れた現金の支払いを
 *   見てください」としか言いません。＝ じゅんが1分 数えても、
 *   **いちばん大きい心当たりに名前が付いていない**ので、何の差なのか分かりません
 *   （レジに残したつり銭・日報の空き・レジの過不足・現場の立替・屋号の混ざりと
 *   同じ筋で、これが6件目です）。
 *
 * ■ ここでしないこと（大事）
 *   ① **金額を直しません。** 「計算上の現金」も、月の経費・利益・1枚の要約・
 *      会計ソフト向けCSV・試算表も **1円も変えません**（変えると f1-2・f1-5・f1-7 の
 *      合格が崩れます）。出すのは説明の行だけです。
 *      ※「日当を現金から引く」のは**現金残高の決め方そのものを変える話**なので、
 *        こちらでは決めません（CLAUDE.md 5-4 の「現金残高の計算に触るときは必ず相談」）。
 *        **まず名前を付けて見えるようにするところまで**です。
 *   ② **「もう払った」と決めつけません。** 払った記録が無いので、こちらには分かりません。
 *      言えるのは「この◯円のうち、金庫からお渡しした分だけ金庫が少なくなる」＝
 *      **上限（合計）の中に差が収まるか**までです。
 *   ③ 合否（合っている／合っていない）の決め方は1文字も変えません。
 *      「よくある原因3つ」を出すかどうかも変えません。
 *   ④ **税務の判断はしません**（docs/keiri.md 5-2）。「どう仕訳すべきか」は書かず、
 *      人が心当たりを確かめるための手がかりだけを出します。
 *
 * ■ 外注費・家賃はここでは数えません
 *   どちらも「まだ払っていないお金」には入りますが、発生のしかたが
 *   **率と月額の決まりから出した見込み**で、日報の行そのものではありません
 *   （lib/keiri/aggregate.ts の calcUnpaid）。日当だけが営業日ごとの実績なので、
 *   ここは日当1つに絞ります。
 *
 * ■ 読めなかったときは「0件」と言いません
 *   日報や払った記録は、よそのお店として開いているときや倉庫が落ちているときに読めません。
 *   読めたかどうかを必ず持ち、読めていなければ説明の行は1行も出しません。
 */

import { NEAR_ENOUGH_YEN, monthDay } from "./cashCheck";
import type { KeiriPayment, KeiriReport } from "./types";

export type UnpaidPayrollGap = {
  /** 日報と払った記録を読めたか（**0件と取り違えないため**） */
  readable: boolean;
  /** 日当が入っている日報の件数（数え始めの日から、数えた日まで） */
  rows: number;
  /** その日当の合計 */
  accrued: number;
  /** 「払った」という記録（給与）の件数 */
  paidRows: number;
  /** その合計（＝すでに「計算上の現金」から引いてある分） */
  paid: number;
  /** まだ払った記録が無い分（＝金庫からお渡ししていれば、差になる分の**上限**） */
  unpaid: number;
  /** 日当が入っている いちばん古い日（1件も無ければ null） */
  firstDate: string | null;
  /** 日当が入っている いちばん新しい日（1件も無ければ null） */
  lastDate: string | null;
};

export const EMPTY_UNPAID_PAYROLL_GAP: UnpaidPayrollGap = {
  readable: false,
  rows: 0,
  accrued: 0,
  paidRows: 0,
  paid: 0,
  unpaid: 0,
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
function spanOf(gap: UnpaidPayrollGap): string {
  if (!gap.firstDate) return "";
  if (!gap.lastDate || gap.lastDate === gap.firstDate) return monthDay(gap.firstDate);
  return `${monthDay(gap.firstDate)}〜${monthDay(gap.lastDate)}`;
}

/**
 * 日当のうち「払った記録が無い分」を数える。
 *
 * ★数え方は calcCashPosition / calcUnpaid とそろえてあります
 *   （日当＝期首日以降の日報の labor の合計／払った分＝期首日以降の kind='payroll'）。
 *   ずれると、画面の「計算上の現金」と説明の行が食い違います。
 *
 * @param reports     読めている日報
 * @param payments    読めている「払った記録」
 * @param unreadable  日報または払った記録が読めなかったか（読めていないなら 0件 と言わない）
 * @param openingDate 経理の数え始めの日。これより前は、数えた残高の中身が分からないので数えない
 * @param asOf        数えた日（まだ数えていなければ今日）。この日より後の分は差にならない
 */
export function measureUnpaidPayrollGap(params: {
  reports: readonly KeiriReport[] | null | undefined;
  payments: readonly KeiriPayment[] | null | undefined;
  unreadable?: boolean;
  openingDate: string;
  asOf: string;
}): UnpaidPayrollGap {
  if (params.unreadable || !params.reports) return { ...EMPTY_UNPAID_PAYROLL_GAP };
  const from = String(params.openingDate ?? "").slice(0, 10);
  const asOf = String(params.asOf ?? "").slice(0, 10);
  if (!isYmd(from)) return { ...EMPTY_UNPAID_PAYROLL_GAP };

  const out: UnpaidPayrollGap = { ...EMPTY_UNPAID_PAYROLL_GAP, readable: true };

  for (const r of params.reports) {
    if (!r) continue;
    const date = typeof r.date === "string" ? r.date.slice(0, 10) : "";
    if (!isYmd(date)) continue;
    if (date < from) continue;
    if (isYmd(asOf) && date > asOf) continue;
    const labor = Math.round(Number(r.labor) || 0);
    if (labor === 0) continue;
    out.rows += 1;
    out.accrued += labor;
    if (!out.firstDate || date < out.firstDate) out.firstDate = date;
    if (!out.lastDate || date > out.lastDate) out.lastDate = date;
  }

  for (const p of params.payments ?? []) {
    if (!p || p.kind !== "payroll") continue;
    const paidOn = typeof p.paid_on === "string" ? p.paid_on.slice(0, 10) : "";
    if (!isYmd(paidOn)) continue;
    if (paidOn < from) continue;
    if (isYmd(asOf) && paidOn > asOf) continue;
    const amount = Math.round(Number(p.amount) || 0);
    if (amount === 0) continue;
    out.paidRows += 1;
    out.paid += amount;
  }

  out.unpaid = Math.max(0, out.accrued - out.paid);
  return out;
}

/** 差を、この分がどこまで説明できるか */
export type UnpaidPayrollFit =
  /** 残りとぴったり同じ */
  | "exact"
  /** 残りとほぼ同じ（ちがいは1,000円未満） */
  | "near"
  /** 残りより小さい（＝一部をお渡ししていれば説明がつく） */
  | "within"
  /** この分では説明がつかない */
  | "no";

/**
 * 「金庫のほうが少ない」差が、この分でどこまで説明できるかを見る。
 *
 * @param diff 計算上の残高 − 数えた金額（プラス＝金庫のほうが少ない）
 */
export function unpaidPayrollFit(
  gap: UnpaidPayrollGap,
  diff: number | null,
): UnpaidPayrollFit {
  if (!gap.readable || gap.unpaid <= 0) return "no";
  if (diff === null || !Number.isFinite(diff)) return "no";
  // 金庫のほうが多いとき（マイナス）は、この分では説明できない
  //（お渡しは現金を減らす側なので、増える向きの説明にはならない）
  if (diff <= 0) return "no";
  const rest = Math.abs(diff - gap.unpaid);
  if (rest === 0) return "exact";
  if (rest < NEAR_ENOUGH_YEN) return "near";
  return diff < gap.unpaid ? "within" : "no";
}

/** この分の説明の1行目（金額と件数の事実だけ） */
function factLine(gap: UnpaidPayrollGap): string {
  const span = spanOf(gap);
  const paidPart =
    gap.paidRows > 0
      ? `そのうち「払った」という記録があるのは ${yen(gap.paid)}（${rowsLabel(gap.paidRows)}）だけで、残り ${yen(gap.unpaid)} には払った記録がありません。`
      : `払った記録は1件もありません（${yen(gap.unpaid)} ぜんぶ）。`;
  return (
    `日報に入っている日当が ${rowsLabel(gap.rows)}（合計 ${yen(gap.accrued)}` +
    `${span ? `・${span}` : ""}）あります。${paidPart}`
  );
}

/** この分の説明の2行目（なぜ差になるのか） */
const WHY_LINE =
  "払った記録がある分だけを「計算上の現金」から引いています（まだ払っていないお金は、" +
  "まだ金庫に残っているはずなので引きません）。" +
  "もし払った記録を付けずに、金庫のお金からお渡ししていると、そのぶん金庫のほうが" +
  "少なく出ます（書き忘れではありません）。まだお渡ししていなければ、差にはなりません。";

/**
 * 差の内わけとして出す行（当てはまらなければ空）。
 *
 * @param diff 計算上の残高 − 数えた金額（渡さなければ、差が無いものとして扱う）
 */
export function unpaidPayrollGapLines(
  gap: UnpaidPayrollGap,
  diff?: number | null,
): string[] {
  if (!gap.readable || gap.unpaid <= 0) return [];
  const d = diff ?? null;
  const hasDiff = d !== null && Number.isFinite(d) && Math.abs(d) >= NEAR_ENOUGH_YEN;
  if (!hasDiff) return [];
  const fit = unpaidPayrollFit(gap, d);
  // 金庫のほうが多い側（マイナス）のときは、この分の話ではないので出さない
  if ((d as number) <= 0) return [];
  const lines = [factLine(gap), WHY_LINE];
  if (fit === "exact") {
    lines.push(
      `差 ${yen(d as number)} は、払った記録が無い日当 ${yen(gap.unpaid)} と` +
        "ぴったり同じ金額です。まず、この日当をもうお渡ししたかどうかを確かめてください" +
        "（ほかを探す前に、ここだけで説明がつきます）。",
    );
  } else if (fit === "near") {
    lines.push(
      `差 ${yen(d as number)} は、払った記録が無い日当 ${yen(gap.unpaid)} と` +
        `ほぼ同じ金額です（ちがいは ${yen((d as number) - gap.unpaid)}）。` +
        "まず、この日当をもうお渡ししたかどうかを確かめてください。",
    );
  } else if (fit === "within") {
    lines.push(
      `差 ${yen(d as number)} は、払った記録が無い日当 ${yen(gap.unpaid)} の中に収まります。` +
        "お渡しした分がこの中にあるかどうかを先に確かめてください" +
        "（どの日のぶんをお渡ししたかは記録が無いので、こちらでは決められません）。",
    );
  } else {
    lines.push(
      `ただし差 ${yen(d as number)} は、払った記録が無い日当 ${yen(gap.unpaid)} より` +
        "大きいので、この分だけでは説明がつきません。ほかにも理由があります。",
    );
  }
  return lines;
}

/**
 * 数える前に出す一言（当てはまらなければ空）。
 *
 * ★数えたあとに言っても1分は戻らないので、押す前に出します。止めはしません。
 */
export function unpaidPayrollGapNotice(gap: UnpaidPayrollGap): string {
  if (!gap.readable || gap.unpaid <= 0) return "";
  return (
    factLine(gap) +
    "まだ払っていないお金として別に置いてあり、計算上の現金からは引いていません。" +
    `金庫のお金からお渡ししている分があると、そのぶん（多くても ${yen(gap.unpaid)}）` +
    "金庫のほうが少なく出ます。"
  );
}

/**
 * 外から確かめる窓口に返す形（2026-11-05・f1-4）。
 * **本物の金額は1円も返しません**（lib/keiri/checkWindow.ts の決まり③）。
 * 返すのは「読めたか・何件か・日付・説明がどこまでつくか・行が出るか」だけです。
 */
export type UnpaidPayrollGapWindow = {
  /** 日報と払った記録を読めたか */
  readable: boolean;
  /** 日当が入っている日報の件数 */
  rows: number;
  /** 「払った」という記録の件数 */
  paidRows: number;
  /** 払った記録が無い日当があるか（金額は返さない） */
  hasUnpaid: boolean;
  firstDate: string | null;
  lastDate: string | null;
  /** 差をこの分でどこまで説明できるか */
  fit: UnpaidPayrollFit;
  /** 画面に差の内わけの行が出るか（＝差が1,000円以上で、当てはまる行がある） */
  shown: boolean;
  /** ひとこと（金額は入れない） */
  note: string;
};

export function buildUnpaidPayrollGapWindow(params: {
  gap: UnpaidPayrollGap;
  /** 計算上の残高 − 数えた金額（まだ数えていなければ null） */
  diff: number | null;
}): UnpaidPayrollGapWindow {
  const { gap, diff } = params;
  const fit = unpaidPayrollFit(gap, diff);
  const hasUnpaid = gap.readable && gap.unpaid > 0;
  const hasDiff = diff !== null && Number.isFinite(diff) && Math.abs(diff) >= NEAR_ENOUGH_YEN;
  const shown = hasUnpaid && hasDiff && (diff as number) > 0;
  const note = !gap.readable
    ? "日報または払った記録が読めていません（0件という意味ではありません。この行は出ません）。"
    : gap.rows === 0
      ? "数え始めの日からあと、日当が入っている日報は1件もありません（この行は出ません）。"
      : !hasUnpaid
        ? `日当が入っている日報は ${gap.rows}件 で、払った記録がそろっています（この行は出ません）。`
        : fit === "exact"
          ? `差は、払った記録が無い日当とぴったり同じ金額です（日報 ${gap.rows}件・払った記録 ${gap.paidRows}件）。`
          : fit === "near"
            ? `差は、払った記録が無い日当とほぼ同じ金額です（日報 ${gap.rows}件・払った記録 ${gap.paidRows}件）。`
            : fit === "within"
              ? `差は、払った記録が無い日当の中に収まります（日報 ${gap.rows}件・払った記録 ${gap.paidRows}件）。`
              : hasDiff && (diff as number) > 0
                ? `払った記録が無い日当があります（日報 ${gap.rows}件・払った記録 ${gap.paidRows}件）。差のほうが大きく、この分だけでは説明がつきません。`
                : hasDiff
                  ? `払った記録が無い日当がありますが、金庫のほうが多い側の差なので、この分の話ではありません（日報 ${gap.rows}件・払った記録 ${gap.paidRows}件）。`
                  : `払った記録が無い日当があります（日報 ${gap.rows}件・払った記録 ${gap.paidRows}件）。いまは差が出ていないので、行は出ません。`;
  return {
    readable: gap.readable,
    rows: gap.rows,
    paidRows: gap.paidRows,
    hasUnpaid,
    firstDate: gap.firstDate,
    lastDate: gap.lastDate,
    fit,
    shown,
    note,
  };
}
