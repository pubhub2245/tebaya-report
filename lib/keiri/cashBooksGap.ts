/**
 * 「日報がどこまで入っているか」を数えるところ（2026-11-01・f1-4）。
 * **計算だけ**（倉庫は触りません・金額は1円も作りません）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   「今の現金」は、日報に入っている売上を足し、日報に入っている経費を引いて出します。
 *   ＝ **日報がまだ入っていない営業日があると、その分だけ計算上の現金がずれます。**
 *   ところが画面は「金庫のほうが◯◯円 多いです。書き忘れた売上を見てください」と
 *   言うので、**どこを見ればいいのかが分かりません**（探す先が「全部」になります）。
 *
 *   2026-11-01 時点の手羽屋の実データでは、日報のいちばん新しい日は 10月18日 で、
 *   そこから2週間ぶん 入っていません。この状態で じゅんが金庫を1回 数えると、
 *   差はほぼ確実に大きく出ます。**その差の理由を名指しできないと、
 *   じゅんの1分が「よく分からない結果」で終わります。**
 *   そこで「日報はここまで入っています」という1行を、差の内わけとして出します。
 *
 * ■ ここでしないこと（大事）
 *   ① 金額を直しません。**月の経費・利益・1枚の要約・会計ソフト向けCSVは1円も変えません**
 *      （変えると f1-2・f1-5 の合格が崩れます）。出すのは説明の行だけです。
 *   ② 「営業したのに入っていない」と言い切りません。休んだ日かもしれないので、
 *      「営業した日があれば」という言い方にします（こちらで決めつけない）。
 *   ③ 合否（合っている／合っていない）の決め方は1文字も変えません。
 *
 * ■ 日数の線は 3日
 *   前の日の日報は、その晩か翌日に入ります。1〜2日 空くのはふつうなので、
 *   **3日以上 空いているときだけ**一言を出します（よけいな行を増やさない）。
 */

import { NEAR_ENOUGH_YEN, daysBetween, monthDay } from "./cashCheck";
import type { KeiriReport } from "./types";

/** これ以上 空いていたら一言を出す（日） */
export const BOOKS_GAP_DAYS = 3;

export type CashBooksGap = {
  /** 日報のいちばん新しい日（読めた中で・無ければ null） */
  lastDate: string | null;
  /** 読めた日報の件数 */
  count: number;
  /** いちばん新しい日から、比べる日（数えた日）まで何日 空いているか */
  days: number | null;
  /** 一言を出すほど空いているか（3日以上） */
  wide: boolean;
};

export const EMPTY_CASH_BOOKS_GAP: CashBooksGap = {
  lastDate: null,
  count: 0,
  days: null,
  wide: false,
};

/**
 * その文字列が「ほんとうにある日」か（形だけでなく、暦として成り立つか）。
 *
 * ★形（0000-00-00）だけを見ると「2026-13-99」のような壊れた値が通り、
 *   画面に「13月99日」と出てしまいます。ここで落とします。
 */
function isRealDate(date: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  // その月に何日あるか（うるう年も自動で合う）
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d <= lastDay;
}

/**
 * 日報がどこまで入っているかを数える。
 *
 * @param reports 読めている日報（期首日から今日までぶん）
 * @param asOf    比べる日（金庫を数えた日。まだ数えていなければ今日）
 */
export function measureBooksGap(params: {
  reports: KeiriReport[];
  asOf: string;
}): CashBooksGap {
  const asOf = String(params.asOf ?? "").slice(0, 10);
  let lastDate: string | null = null;
  let count = 0;
  for (const r of params.reports ?? []) {
    const date = typeof r?.date === "string" ? r.date.slice(0, 10) : "";
    if (!isRealDate(date)) continue;
    count += 1;
    if (!lastDate || date > lastDate) lastDate = date;
  }
  if (!lastDate) return { lastDate: null, count, days: null, wide: false };
  if (!isRealDate(asOf)) {
    return { lastDate, count, days: null, wide: false };
  }
  const days = daysBetween(lastDate, asOf);
  // 比べる日より後の日報しか無い（＝さかのぼって数えている）ときは空きではない
  const gap = days !== null && days > 0 ? days : 0;
  return { lastDate, count, days: gap, wide: gap >= BOOKS_GAP_DAYS };
}

/** 「◯日前」 */
function daysAgo(days: number): string {
  return days === 1 ? "1日前" : `${days}日前`;
}

/**
 * 差の内わけとして出す行（当てはまらなければ空）。
 *
 * @param diff 計算上の残高 − 数えた金額（渡さなければ、差が無いものとして扱う）
 */
export function cashBooksGapLines(
  gap: CashBooksGap,
  diff?: number | null,
): string[] {
  if (!gap.wide || !gap.lastDate || gap.days === null) return [];
  const d = diff ?? null;
  const hasDiff = d !== null && Number.isFinite(d) && Math.abs(d) >= NEAR_ENOUGH_YEN;
  if (!hasDiff) return [];
  return [
    `日報がいちばん新しいのは ${monthDay(gap.lastDate)} です（数えた日の ${daysAgo(gap.days)}）。`,
    "それ以降に営業した日があれば、その日の売上と、その日に金庫から払った経費は、" +
      "上の計算に入っていません。売上のぶんは金庫のほうが多く見え、" +
      "金庫から払った経費のぶんは金庫のほうが少なく見えます。",
    "ほかを探す前に、まず日報が入っているかを見てください（入れれば、ここは自然に合います）。",
  ];
}

/**
 * 外から確かめる窓口に返す形（2026-11-01・f1-4）。
 * **金額は1円も返しません。** 返すのは日付・件数・日数・一言だけです。
 */
export type CashBooksGapWindow = {
  /** 日報のいちばん新しい日（金額ではない） */
  lastDate: string | null;
  /** 読めた日報の件数 */
  count: number;
  /** いちばん新しい日から、比べる日まで何日 空いているか */
  days: number | null;
  /** 3日以上 空いているか */
  wide: boolean;
  /** 画面に行が出るか（＝差が大きくて、3日以上 空いている） */
  shown: boolean;
  /** ひとこと（金額は入れない） */
  note: string;
};

export function buildCashBooksGapWindow(params: {
  gap: CashBooksGap;
  /** 計算上の残高 − 数えた金額（まだ数えていなければ null） */
  diff: number | null;
}): CashBooksGapWindow {
  const { gap, diff } = params;
  const hasDiff = diff !== null && Number.isFinite(diff) && Math.abs(diff) >= NEAR_ENOUGH_YEN;
  const shown = gap.wide && hasDiff;
  const note = !gap.lastDate
    ? "日報が1件も読めていません（この行は出ません）。"
    : !gap.wide
      ? `日報は ${monthDay(gap.lastDate)} まで入っています（空きは${gap.days ?? 0}日なので、行は出ません）。`
      : shown
        ? `日報は ${monthDay(gap.lastDate)} まで入っていて、そこから ${gap.days}日 空いています。` +
          "差の内わけとして、まずここを見るように画面に出しています。"
        : `日報は ${monthDay(gap.lastDate)} まで入っていて、そこから ${gap.days}日 空いています` +
          "（いまは差が出ていないので、行は出ません）。";
  return { lastDate: gap.lastDate, count: gap.count, days: gap.days, wide: gap.wide, shown, note };
}
