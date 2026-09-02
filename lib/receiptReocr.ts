/**
 * 昔のレシート写真を読み直して、税抜のまま入っている金額を税込に直すための判定。
 *
 * ■ 何をするのか
 *   写真つきの経費の行について、写真をもう一度読み取り、
 *   **その行に対応する品物の税込金額**に置き換えます。
 *
 * ■ 慎重にしている理由
 *   直す前のアプリは、1枚のレシートから作った行のうち
 *   **1行目にだけ写真を付けて**いました（2行目以降は写真なし）。
 *   だから「写真つきの行」＝「そのレシートの1品目」とは限りません。
 *   読み直した品物のどれがその行なのか、はっきり分からないことがあります。
 *
 *   そこで **名前がきちんと一致したときだけ直します。**
 *   分からなければ直さず「要確認」に回します。
 *   **勝手に金額を作らないこと。**
 *
 * ■ 写真の無い行には触りません
 *   同じレシートの2行目以降（写真なし）は「不明」の扱いで、
 *   オーナーの判断により触らないと決まっています（docs/keiri.md 11-5）。
 */

import { normalizeText } from "./keiri/classify";
import { MAX_TAX_RATIO } from "./receiptTax";
import type { ReadReceiptResult } from "./receiptOcr";

export type ReocrDecision = {
  /** 直すか、そのままにするか */
  action: "fix" | "skip";
  /** 直すときの新しい金額 */
  newAmount?: number;
  /** 読み取りの中で対応づいた品物の名前 */
  matchedName?: string;
  /** 人に見せる理由 */
  reason: string;
};

/** 商品名を比べるための形に揃える（前後の空白・全角半角をならす） */
function key(s: string | null | undefined): string {
  return normalizeText(s).replace(/[\s　]+/g, "");
}

/**
 * 読み取り結果の中から、その行に対応する品物を1つだけ選ぶ。
 *
 * ① 名前がぴったり同じ
 * ② 片方がもう片方の先頭部分（レシートの商品名は途中で切れていることがある）
 * ③ 品物が1つしかない読み取りなら、それ
 *
 * 同じ名前が2つ以上あるときは選ばない（どちらか分からないため）。
 */
export function findMatchingItem(
  description: string | null | undefined,
  ocr: ReadReceiptResult,
): { name: string; amount: number } | null {
  const target = key(description);
  if (!target || ocr.items.length === 0) return null;

  const exact = ocr.items.filter((it) => key(it.name) === target);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null; // 同じ名前が複数 → 決められない

  const prefix = ocr.items.filter((it) => {
    const k = key(it.name);
    if (!k) return false;
    // 短いほうが長いほうの先頭になっているか（3文字以上のときだけ）
    const [a, b] = k.length <= target.length ? [k, target] : [target, k];
    return a.length >= 3 && b.startsWith(a);
  });
  if (prefix.length === 1) return prefix[0];
  if (prefix.length > 1) return null;

  if (ocr.items.length === 1) return ocr.items[0];
  return null;
}

/**
 * 写真つきの行1件について、読み直した結果をどう扱うか決める。
 *
 * 直すのは「名前が対応づいて、増える方向で、増え方が消費税で説明できる」ときだけ。
 */
export function decideReocrFix(
  description: string | null | undefined,
  storedAmount: number,
  ocr: ReadReceiptResult,
): ReocrDecision {
  const stored = Number(storedAmount) || 0;

  if (ocr.items.length === 0)
    return { action: "skip", reason: "レシートを読み取れなかった" };

  const match = findMatchingItem(description, ocr);
  if (!match)
    return {
      action: "skip",
      reason: "レシートのどの品物か決められなかった（名前が一致しない）",
    };

  const next = Number(match.amount) || 0;
  if (next <= 0)
    return { action: "skip", matchedName: match.name, reason: "読み取った金額が0円" };

  if (stored <= 0)
    return {
      action: "skip",
      matchedName: match.name,
      reason: "元の金額が0円なので比べられない",
    };

  if (next === stored)
    return {
      action: "skip",
      matchedName: match.name,
      reason: "すでに税込だった（金額は変わらない）",
    };

  const ratio = next / stored;
  if (ratio < 1)
    return {
      action: "skip",
      matchedName: match.name,
      reason: `読み取りのほうが少ない（${stored}円 → ${next}円）。人が確かめること`,
    };
  if (ratio > MAX_TAX_RATIO)
    return {
      action: "skip",
      matchedName: match.name,
      reason: `差が大きすぎて消費税では説明できない（${stored}円 → ${next}円）。人が確かめること`,
    };

  return {
    action: "fix",
    newAmount: next,
    matchedName: match.name,
    reason: `レシートの税込金額に合わせた（${stored}円 → ${next}円）`,
  };
}
