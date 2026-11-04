/**
 * 「日報に入っている“レジの過不足”」を数えるところ
 * （2026-11-04・f1-4）。**計算だけ**（倉庫は触りません・金額は1円も作りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   日報の STEP3 には［! 差異あり］のボタンがあり、レジのお金が合わなかった日は
 *   その差額を入れます（不足はマイナス。例：-500）。**これは実際に減った／増えた
 *   現金そのもの**です。
 *
 *   いっぽう画面の「計算上の現金」は
 *     数え始めの残高 ＋ 売上 − 金庫から出た経費 − 支払い − 返した立替 − 銀行に入れた分
 *   で出しています。**レジの過不足はこの式のどこにも入っていません。**
 *
 *   ＝ 過不足が入っている日が1日でもあると、じゅんが金庫を数えたときに
 *   **そのぶんだけ必ず食い違います**。ところが画面は
 *   「金庫のほうが◯◯円 少ないです。書き忘れた現金の支払いを見てください」としか
 *   言わないので、**日報にちゃんと書いてあるのに、無い探し物をさせてしまいます**。
 *   1分 数えてもらったのに「よく分からない差」で終わる形です
 *   （lib/keiri/registerFloat.ts・lib/keiri/cashBooksGap.ts と同じ筋の問題）。
 *
 * ■ ここでしないこと（大事）
 *   ① **金額を直しません。** 「今の現金」も、月の経費・利益・1枚の要約・
 *      会計ソフト向けCSV・試算表も **1円も変えません**（変えると f1-2・f1-5・f1-7 の
 *      合格が崩れます）。出すのは説明の行だけです。
 *      ※「計算上の現金」にこの分を入れるかどうかは現金残高の決め方そのものを
 *        変える話なので、こちらでは決めません（CLAUDE.md 5-4「現金残高の計算に
 *        触るときは必ず事前に相談する」）。**まず名前を付けて見えるようにするところまで**です。
 *   ② 「レジから誰かが取った」などの理由を決めつけません。書いてある事実
 *      （過不足としてこれだけ入っている）と、どちら向きにずれるかだけを言います。
 *   ③ 合否（合っている／合っていない）の決め方は1文字も変えません。
 *
 * ■ 読めなかったときは「0円」と言いません
 *   欄が読めないことがある（よそのお店として読んでいるとき・倉庫が落ちているとき）ので、
 *   読めたかどうかを必ず持ちます。読めていなければ説明の行は1行も出しません。
 */

import { NEAR_ENOUGH_YEN, monthDay } from "./cashCheck";

/** 日報1件ぶんの「レジの過不足」 */
export type RegisterDiffRow = {
  /** 営業日（YYYY-MM-DD） */
  date: string;
  /** 過不足（円）。マイナス＝レジが不足していた */
  amount: number;
};

export type RegisterDiffGap = {
  /** 日報の「レジの過不足」の欄を読めたか（**0円と取り違えないため**） */
  readable: boolean;
  /** 0 でない過不足が入っている日報の件数 */
  rows: number;
  /** その合計（マイナス＝レジが不足していた側） */
  total: number;
  /** そのうち、いちばん新しい日（1件も無ければ null） */
  lastDate: string | null;
};

export const EMPTY_REGISTER_DIFF_GAP: RegisterDiffGap = {
  readable: false,
  rows: 0,
  total: 0,
  lastDate: null,
};

/** その文字列が YYYY-MM-DD の形をしているか */
function isYmd(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * 倉庫から来た行（date / register_diff）を、計算に使える形にそろえる。
 *
 * ★0円・空・数字でないものは落とします（説明の行を増やさないため）。
 * ★号車は見ません。レジは号車ごとに別ですが、**金庫から見れば過不足は過不足**で、
 *   号車ぶんを足した額だけ食い違います（CLAUDE.md 4-9 の「号車を混ぜない」は
 *   閉店後／開店前の突き合わせの話で、ここは足し算です）。
 */
export function normalizeRegisterDiffs(rows: unknown[]): RegisterDiffRow[] {
  const out: RegisterDiffRow[] = [];
  for (const raw of rows ?? []) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const date = String(r.date ?? "").slice(0, 10);
    if (!isYmd(date)) continue;
    const amount = Number(r.register_diff);
    if (!Number.isFinite(amount)) continue;
    const yen = Math.round(amount);
    if (yen === 0) continue;
    out.push({ date, amount: yen });
  }
  return out;
}

/**
 * 数え始めの日から、数えた日までの「レジの過不足」を足す。
 *
 * @param rows        読めた過不足の行（読めていなければ null を渡す）
 * @param openingDate 経理の数え始めの日（これより前は、数えた残高にもう入っている）
 * @param asOf        数えた日（まだ数えていなければ今日）
 */
export function measureRegisterDiffGap(params: {
  rows: RegisterDiffRow[] | null;
  openingDate: string;
  asOf: string;
}): RegisterDiffGap {
  const rows = params.rows;
  if (!rows) return { ...EMPTY_REGISTER_DIFF_GAP };
  const from = String(params.openingDate ?? "").slice(0, 10);
  const asOf = String(params.asOf ?? "").slice(0, 10);
  let count = 0;
  let total = 0;
  let lastDate: string | null = null;
  for (const r of rows) {
    if (!isYmd(r.date)) continue;
    if (isYmd(from) && r.date < from) continue;
    if (isYmd(asOf) && r.date > asOf) continue;
    count += 1;
    total += r.amount;
    if (!lastDate || r.date > lastDate) lastDate = r.date;
  }
  return { readable: true, rows: count, total, lastDate };
}

/** 「金庫のほうが少なく／多く」。合計が0なら null */
export function registerDiffDirection(gap: RegisterDiffGap): "少なく" | "多く" | null {
  if (!gap.readable || gap.total === 0) return null;
  // 不足（マイナス）＝実際の現金はそのぶん少ない
  return gap.total < 0 ? "少なく" : "多く";
}

/** 「◯件」 */
function rowsLabel(rows: number): string {
  return rows === 1 ? "1日ぶん" : `${rows}日ぶん`;
}

/** 円の表示（この1枚の中だけで使う。マイナスは符号を付けずに言葉で向きを言う） */
function yen(n: number): string {
  return `${Math.abs(Math.round(n)).toLocaleString("ja-JP")}円`;
}

/**
 * 差の内わけとして出す行（当てはまらなければ空）。
 *
 * @param diff 計算上の残高 − 数えた金額（渡さなければ、差が無いものとして扱う）
 */
export function registerDiffGapLines(
  gap: RegisterDiffGap,
  diff?: number | null,
): string[] {
  const dir = registerDiffDirection(gap);
  if (!dir || gap.rows === 0) return [];
  const d = diff ?? null;
  const hasDiff = d !== null && Number.isFinite(d) && Math.abs(d) >= NEAR_ENOUGH_YEN;
  if (!hasDiff) return [];
  const last = gap.lastDate ? `・いちばん新しいのは ${monthDay(gap.lastDate)}` : "";
  return [
    `日報に「レジの過不足」として ${yen(gap.total)} が入っています（${rowsLabel(gap.rows)}${last}）。`,
    `この分は上の「計算上の現金」に入れていないので、そのぶん金庫のほうが ${yen(gap.total)} ${dir}出ます。` +
      "書き忘れではありません（日報にそう書いてあります）。",
  ];
}

/**
 * 数える前に出す一言（当てはまらなければ空）。
 *
 * ★数えたあとに言っても1分は戻らないので、押す前に出します。止めはしません。
 */
export function registerDiffGapNotice(gap: RegisterDiffGap): string {
  const dir = registerDiffDirection(gap);
  if (!dir || gap.rows === 0) return "";
  return (
    `日報に「レジの過不足」が ${rowsLabel(gap.rows)} 入っています（合計 ${yen(gap.total)}）。` +
    `この分は計算上の現金に入れていないので、金庫のほうが ${yen(gap.total)} ${dir}出ます。` +
    "差が出てもそのぶんは書き忘れではありません。"
  );
}

/**
 * 外から確かめる窓口に返す形（2026-11-04・f1-4）。
 * **本物の金額は1円も返しません**（checkWindow.ts の決まり③）。
 * 返すのは「読めたか・何日ぶんか・どちら向きにずれるか・行が出るか」だけです。
 */
export type RegisterDiffGapWindow = {
  /** 日報の「レジの過不足」の欄を読めたか */
  readable: boolean;
  /** 0 でない過不足が入っている日報の件数 */
  rows: number;
  /** 合計が0でないか（金額そのものは返さない） */
  differs: boolean;
  /** 金庫のほうが「少なく」出るか「多く」出るか（0なら null） */
  direction: "少なく" | "多く" | null;
  /** そのうち、いちばん新しい日（金額ではない） */
  lastDate: string | null;
  /** 画面に差の内わけの行が出るか（＝差が1,000円以上で、過不足が入っている） */
  shown: boolean;
  /** ひとこと（金額は入れない） */
  note: string;
};

export function buildRegisterDiffGapWindow(params: {
  gap: RegisterDiffGap;
  /** 計算上の残高 − 数えた金額（まだ数えていなければ null） */
  diff: number | null;
}): RegisterDiffGapWindow {
  const { gap, diff } = params;
  const dir = registerDiffDirection(gap);
  const hasDiff = diff !== null && Number.isFinite(diff) && Math.abs(diff) >= NEAR_ENOUGH_YEN;
  const shown = !!dir && gap.rows > 0 && hasDiff;
  const note = !gap.readable
    ? "日報の「レジの過不足」の欄が読めていません（0円という意味ではありません。この行は出ません）。"
    : gap.rows === 0
      ? "日報に「レジの過不足」は1日も入っていません（この行は出ません）。"
      : !dir
        ? `過不足は ${gap.rows}日ぶん 入っていますが、足すとちょうど0なので行は出ません。`
        : shown
          ? `日報に「レジの過不足」が ${gap.rows}日ぶん 入っていて、金庫のほうが${dir}出ます。` +
            "差の内わけとして、書き忘れではないことを画面に出しています。"
          : `日報に「レジの過不足」が ${gap.rows}日ぶん 入っていて、金庫のほうが${dir}出ます` +
            "（いまは差が出ていないので、行は出ません）。";
  return {
    readable: gap.readable,
    rows: gap.rows,
    differs: !!dir,
    direction: dir,
    lastDate: gap.lastDate,
    shown,
    note,
  };
}
