/**
 * 日報の経費1行が「**ほんとうに金庫（レジ）の現金から出たのか**」を見分けるところ。
 * **計算だけ**（倉庫は触らない・1円も作らない）。
 *
 * ■ なぜ要るのか（2026-10-08・kp233・f1-4）
 *   いままで「今の現金」は、日報の経費を**全部**引いていました。
 *   ところが9月の実データを数え直すと、経費の中に
 *   金庫から出ていないものが混ざっていました。
 *     ・だれかが自分のお金で先に払った分（説明に「立替」と書かれている）
 *     ・PayPay 14,609円／TRIAL プリカ 3,909円（＝現金ではない。どちらも「未確定・精査中」）
 *   これを現金から引くと、**出ていないお金を引く**ことになります。
 *   そのため「計算上の金庫残高」が人によって3通り（928,010円／126,552円／79,695円）になり、
 *   じゅんが金庫を数えても、出てくる「差」が何の差なのか分からない状態でした。
 *
 * ■ どう直すか
 *   経費の行の文字（説明・「払った人」の欄）から、**払い方**を3つに分けます。
 *     現金　　 … 金庫から出た。現金残高から引く
 *     立替　　 … だれかが自分のお金で払った。金庫からは出ていない（返した日に出る）
 *     現金以外 … PayPay・プリカ・カード・振込など。金庫からは出ていない
 *   **月の経費（利益の側）は1円も変えません。** 変わるのは「現金がいくら減ったか」だけです
 *   （docs/keiri.md の「月の経費は立替も含めた全部ひとつ」という決まりはそのまま）。
 *
 * ■ 守ること
 *   ① 金額を作らない。拾った行の金額をそのまま使う。
 *   ② 分からない行は **現金** に倒す（いままでと同じ数え方。黙って現金を増やさない）。
 *   ③ 日報の入力画面・入力の形は1行も変えない（docs/keiri.md 5-2）。
 *      ここは**すでに入っている文字を読むだけ**で、現場の手間は増えません。
 *   ④ 「現金以外」と見分けた分は、消さずに**別の数字として画面に出す**。
 */

import { amountOf, expenseItemsOf, normalizeText } from "./classify";
import type { ExpenseItem } from "./types";

/** 払い方の3つ */
export type CashMeans = "cash" | "advance" | "noncash";

export const CASH_MEANS_LABEL: Record<CashMeans, string> = {
  cash: "現金で払った",
  advance: "立替（自分のお金で先に払った）",
  noncash: "現金以外（PayPay・プリカ・カードなど）",
};

/**
 * 「立替」と読める言い方。
 * ★「立替」という字が入っていれば立替。実データの「もも屋の売上金から立替」も当たる。
 */
const ADVANCE_WORDS = [
  "立替",
  "立て替",
  "たてかえ",
  "たて替",
  "自腹",
  "個人払",
  "個人立",
];

/**
 * 「現金ではない」と読める言い方。
 * ★実データに出ているのは PayPay と TRIAL プリカ。ほかは同じ種類のものを並べただけ。
 */
const NONCASH_WORDS = [
  "paypay",
  "ペイペイ",
  "楽天ペイ",
  "aupay",
  "au pay",
  "d払い",
  "プリカ",
  "プリペイド",
  "電子マネー",
  "nanaco",
  "ナナコ",
  "waon",
  "ワオン",
  "suica",
  "スイカカード",
  "クレジット",
  "カード払",
  "カード決済",
  "振込",
  "振り込み",
  "口座引落",
  "口座振替",
  "引き落とし",
  "引落",
];

/**
 * 経費1行の「読む文字」を集める。
 * 日報の経費は 中身・金額・払った人・レシート写真・レシートが無い理由 の5つで、
 * 「払った人」は**自由に書く文字**です（選ぶ形ではありません）。
 * どちらに書かれていても拾えるように、両方つないでから見ます。
 */
export function meansTextOf(item: ExpenseItem): string {
  const row = (item ?? {}) as Record<string, unknown>;
  const parts = [row.description, row.payer, row.paid_by, row.memo, row.note];
  return normalizeText(parts.filter((p) => typeof p === "string").join(" "));
}

/**
 * 経費1行の払い方を決める。
 *
 * 見る順番に意味があります：
 *   ① 「現金以外」の言葉（PayPay・プリカなど）が入っていたら 現金以外
 *   ② 「立替」の言葉が入っていたら 立替
 *   ③ どちらも無ければ 現金（＝いままでと同じ数え方）
 *
 * ★①を先に見るのは、実データに「PayPay で立替」のように
 *   両方の言葉が入る行があり得るためです。この場合、金庫から出ていないことは
 *   どちらでも同じですが、**現金以外**として出したほうが人が直しやすくなります。
 */
export function classifyCashMeans(item: ExpenseItem): CashMeans {
  const text = meansTextOf(item);
  if (!text) return "cash";
  for (const w of NONCASH_WORDS) {
    if (text.includes(normalizeText(w))) return "noncash";
  }
  for (const w of ADVANCE_WORDS) {
    if (text.includes(normalizeText(w))) return "advance";
  }
  return "cash";
}

/** 払い方ごとの合計 */
export type CashMeansBreakdown = {
  /** 金庫から出た分（現金残高から引く分） */
  cash: number;
  /** 立替。金庫からは出ていない */
  advance: number;
  /** 現金以外。金庫からは出ていない */
  noncash: number;
  /** 3つの合計（＝月の経費の側で数えている額と同じ） */
  total: number;
  /** 現金以外・立替の行数（画面に「何件 見分けたか」を出すため） */
  advanceCount: number;
  noncashCount: number;
};

export const EMPTY_BREAKDOWN: CashMeansBreakdown = {
  cash: 0,
  advance: 0,
  noncash: 0,
  total: 0,
  advanceCount: 0,
  noncashCount: 0,
};

/** 経費の明細（jsonb）を払い方ごとに足す */
export function breakdownCashMeans(expenses: unknown): CashMeansBreakdown {
  const out: CashMeansBreakdown = { ...EMPTY_BREAKDOWN };
  for (const item of expenseItemsOf(expenses)) {
    const yen = amountOf(item);
    const means = classifyCashMeans(item);
    out[means] += yen;
    out.total += yen;
    if (means === "advance") out.advanceCount += 1;
    if (means === "noncash") out.noncashCount += 1;
  }
  return out;
}

/** いくつかの日報ぶんを足す */
export function addBreakdown(
  a: CashMeansBreakdown,
  b: CashMeansBreakdown,
): CashMeansBreakdown {
  return {
    cash: a.cash + b.cash,
    advance: a.advance + b.advance,
    noncash: a.noncash + b.noncash,
    total: a.total + b.total,
    advanceCount: a.advanceCount + b.advanceCount,
    noncashCount: a.noncashCount + b.noncashCount,
  };
}
