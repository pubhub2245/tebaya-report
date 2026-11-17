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
  /** いちばん新しい日から、比べる日（数えた日）まで何日 空いているか（＝「◯日前」） */
  days: number | null;
  /**
   * **日報が入っていない日が何日あるか**（＝ いちばん新しい日の翌日から、
   * 数える日の**前の日**まで）。数える日そのものは入れません。
   *
   * ★なぜ days と別に持つのか（2026-11-16・f1-4）
   *   days は「いちばん新しい日報は何日前か」で、数える日そのものを1日 数えます。
   *   ところが **じゅんに答えてもらう「この◯日は お休みでしたか」の◯日**は、
   *   数える日を含みません（lib/keiri/cashBooksGapOpen.ts の booksGapDates）。
   *   そのため、じゅんの一覧（/keiri のいちばん上）は「この10日」と書き、
   *   同じ画面の用意の一言は「そこから 11日」と書く、という**2つの数字**が
   *   出ていました（2026-11-16 に本番で実測）。同じものを指す数字は1つにします。
   *   数える日そのものは、別に `countDay`（その日に出店の予定があるか）で見ます。
   */
  missingDays: number | null;
  /** 一言を出すほど空いているか（3日以上） */
  wide: boolean;
};

export const EMPTY_CASH_BOOKS_GAP: CashBooksGap = {
  lastDate: null,
  count: 0,
  days: null,
  missingDays: null,
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
  if (!lastDate) return { lastDate: null, count, days: null, missingDays: null, wide: false };
  if (!isRealDate(asOf)) {
    return { lastDate, count, days: null, missingDays: null, wide: false };
  }
  const days = daysBetween(lastDate, asOf);
  // 比べる日より後の日報しか無い（＝さかのぼって数えている）ときは空きではない
  const gap = days !== null && days > 0 ? days : 0;
  // 数える日そのものは「まだ終わっていない日」なので、空いた日には数えない
  const missingDays = Math.max(0, gap - 1);
  return { lastDate, count, days: gap, missingDays, wide: gap >= BOOKS_GAP_DAYS };
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
  /** いちばん新しい日から、比べる日まで何日 空いているか（＝「◯日前」） */
  days: number | null;
  /** 日報が入っていない日が何日あるか（数える日そのものは入れない） */
  missingDays: number | null;
  /** 3日以上 空いているか */
  wide: boolean;
  /** 画面に行が出るか（＝差が大きくて、3日以上 空いている） */
  shown: boolean;
  /** ひとこと（金額は入れない） */
  note: string;
  /**
   * この日数を、**いつに合わせて数えたか**（YYYY-MM-DD・2026-11-17・f1-4）。
   * 金庫を1回でも数えていれば「数えた日」、まだなら「今日」です。
   */
  asOf: string | null;
  /** 金庫を数えた日（まだ数えていなければ null） */
  countedOn: string | null;
  /** asOf の読み方（人が読む1行・金額は入れない） */
  asOfMeans: string;
  /** days と missingDays が わざと違う数であることの説明（人が読む1行） */
  countMeans: string;
};

export function buildCashBooksGapWindow(params: {
  gap: CashBooksGap;
  /** 計算上の残高 − 数えた金額（まだ数えていなければ null） */
  diff: number | null;
  /**
   * この日数を合わせた日（YYYY-MM-DD）。渡さなければ今までどおり null。
   * 金庫を1回でも数えていれば「数えた日」、まだなら「今日」を渡します。
   */
  asOf?: string | null;
  /** 金庫を数えた日（まだ数えていなければ null） */
  countedOn?: string | null;
  /** 今日（YYYY-MM-DD）。用意の一言がどの日で数えているかを言うために使う */
  today?: string | null;
}): CashBooksGapWindow {
  const { gap, diff } = params;
  const asOf = params.asOf ?? null;
  const countedOn = params.countedOn ?? null;
  const today = params.today ?? null;
  const hasDiff = diff !== null && Number.isFinite(diff) && Math.abs(diff) >= NEAR_ENOUGH_YEN;
  const shown = gap.wide && hasDiff;
  // ★ここで出す「空いています」の日数は missingDays（数える日そのものは入れない）。
  //   days（＝◯日前）を使うと、じゅんが答える「この◯日は お休みでしたか」の◯日と
  //   1日 ずれます（2026-11-16・f1-4）。
  const missing = gap.missingDays ?? 0;
  const note = !gap.lastDate
    ? "日報が1件も読めていません（この行は出ません）。"
    : !gap.wide
      ? `日報は ${monthDay(gap.lastDate)} まで入っています（空きは${missing}日なので、行は出ません）。`
      : shown
        ? `日報は ${monthDay(gap.lastDate)} まで入っていて、そこから ${missing}日 空いています。` +
          "差の内わけとして、まずここを見るように画面に出しています。"
        : `日報は ${monthDay(gap.lastDate)} まで入っていて、そこから ${missing}日 空いています` +
          "（いまは差が出ていないので、行は出ません）。";
  return {
    lastDate: gap.lastDate,
    count: gap.count,
    days: gap.days,
    missingDays: gap.missingDays,
    wide: gap.wide,
    shown,
    note,
    asOf,
    countedOn,
    asOfMeans: booksGapAsOfMeans({ asOf, countedOn, today }),
    countMeans: BOOKS_GAP_COUNT_MEANS,
  };
}

/**
 * days と missingDays は **わざと違う数**です（2026-11-17・f1-4）。
 * 並べて読んだ人が「数字が壊れている」と読まないように、理由を1行 添えます
 * （2026-11-11 と 2026-11-16 に、同じ形で2回 立ち止まっているため）。
 */
export const BOOKS_GAP_COUNT_MEANS =
  "days（◯日前）と missingDays（空いている日数）は、**わざと違う数**です。" +
  "days は いちばん新しい日報から 比べる日までの日数で、比べる日そのものを1日 数えます。" +
  "missingDays は その翌日から 比べる日の**前の日**までで、比べる日を数えません" +
  "（その日の日報は営業が終わってから入るため）。ふつうは1日ちがいます。" +
  "**食い違いではありません。** 画面と、じゅんに答えていただく「この◯日は お休みでしたか」は、" +
  "どちらも missingDays のほうを使います。";

/**
 * この日数を「いつに合わせて数えたか」を1行で言う（2026-11-17・f1-4）。
 *
 * ■ なぜ要るか
 *   差の内わけ（この booksGap）は **金庫を数えた日**に合わせて数えます
 *   （lib/keiri/cashCheck.ts の決まり③「突き合わせは必ず数えた日に揃えます」）。
 *   いっぽう、数える前の用意の一言（ready.booksGapDays）は **今日**で数えます。
 *   ＝ 金庫を数えた日の**次の日から**、この2つは1日ずつ ひらいていきます。
 *   どちらも正しいのに、並べて読むと「同じことを指す数字が2つある」形になります
 *   （2026-11-16 に同じ形で1回 止まっています）。先に理由を書いておきます。
 */
export function booksGapAsOfMeans(params: {
  asOf: string | null;
  countedOn: string | null;
  today: string | null;
}): string {
  const { asOf, countedOn, today } = params;
  if (!asOf) return "";
  if (!countedOn) {
    return (
      `ここの日数は 今日（${monthDay(asOf)}）に合わせて数えています` +
      "＝ 数える前の用意の一言（ready.booksGapDays）と**同じ数**です。"
    );
  }
  const todayPart = today ? `今日（${monthDay(today)}）` : "今日";
  return (
    `ここの日数は **金庫を数えた日（${monthDay(countedOn)}）**に合わせて数えています` +
    `（突き合わせは必ず数えた日に揃えるため）。数える前の用意の一言（ready.booksGapDays）は` +
    `${todayPart}で数えるので、**数えた日より後に読むと、この2つは わざと違う数**になります。` +
    "**食い違いではありません**（あとから増えた空きで、数えた日の合否を変えないためです）。"
  );
}
