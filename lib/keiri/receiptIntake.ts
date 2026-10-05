/**
 * レシート写真から読み取った中身を、**そのまま経費の行にして科目まで付ける**ところ。
 *
 * ■ なぜ要るのか（やさしい説明・2026-10-05 / kp229・f1-6）
 *   仕上げチェック表の f1-6 は「レシートの写真から、金額と中身を取り込んで
 *   仕分けできるか」です。これまで道が3つに切れていました。
 *     ① 写真を読む（lib/receiptOcr.ts）… 品名と金額を取る
 *     ② 税込に直す（lib/receiptTax.ts）… 支払合計と突き合わせる
 *     ③ 科目を当てる（lib/keiri/classify.ts）… 「肉代」→ 仕入 など
 *   ①②は日報の入力で動いていますが、**③までつながった道が1本もありません**。
 *   そのため「レシートの取り込みと仕分けができる」と書いてあるのに、
 *   端から端まで1回も通したことがない状態でした。
 *   ここは ①②の結果を受け取って ③ まで通し、
 *   **経理の画面と同じ科目の付け方**（classifyExpense）で行を作ります。
 *
 * ■ 守ること
 *   ・**1行も保存しない**。ここは計算だけ（倉庫にも置き場にも触らない）
 *   ・**金額を勝手に作らない**（CLAUDE.md 4-12）。
 *     支払合計と合わない差は直さず、「人に確かめてもらう」の印を立てる
 *   ・科目の当て方を**ここで新しく作らない**。経理画面と同じ classifyExpense を呼ぶ
 *     （2か所に分かれると、画面とレシートで科目が食い違う）
 *   ・手羽屋が毎日使う日報・シフト・レジ・LINE には触れない
 */

import { accountLabel, type ExpenseAccountKey } from "./accounts";
import { classifyExpense } from "./classify";
import type { BusinessTemplate } from "./types";
import { reconcileMessage, type ReconcileReason, type ReconcileResult } from "../receiptTax";

/** レシート1行ぶんの読み取り結果（lib/receiptOcr.ts が返す形） */
export type ReadItem = { name?: string | null; amount?: number | null };

/** 経費の1行（科目つき）。日報の経費の行と同じ形＋科目 */
export type IntakeRow = {
  /** 経費の「内容」。日報の経費の行にそのまま入る文字 */
  description: string;
  /** 税込の金額（円） */
  amount: number;
  /** 当てた科目 */
  account: ExpenseAccountKey;
  /** 科目の表示名（例：仕入（材料）） */
  accountLabel: string;
  /** 対応表に当たったか。false＝当たらず雑費に置いた＝人に確かめてもらう */
  matched: boolean;
};

export type ReceiptIntake = {
  rows: IntakeRow[];
  /** レシートの支払合計（税込）。読めなければ 0 */
  total: number;
  /** 作った行の合計 */
  rowsTotal: number;
  /** 消費税ぶんを割り振って税込に直したか */
  taxAdjusted: boolean;
  /** 行の合計がレシートの支払合計とぴったり合うか */
  totalMatched: boolean;
  /** 科目が当たらず雑費に置いた行の数 */
  unmatchedCount: number;
  /**
   * 人に確かめてもらう必要があるか。
   * ・支払合計と合わない（消費税で説明がつかない差）
   * ・支払合計が読み取れなかった
   * ・1行も読み取れなかった
   * ・科目が当たらない行がある
   */
  needsHuman: boolean;
  reason: ReconcileReason;
  /** 画面に出す一言（専門用語なし） */
  message: string;
  /** 端から端まで通ったか（行ができて、税込で、科目が全部当たった） */
  ok: boolean;
};

/** 読み取った品名を、経費の「内容」の文字にする */
export function descriptionOf(item: ReadItem): string {
  const name = String(item?.name ?? "").trim();
  return name || "商品名？";
}

/** 金額として読めない値は0にする（壊れた読み取りで落ちないように） */
function amountOf(item: ReadItem): number {
  const n = Number(item?.amount);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/**
 * 読み取りの結果（税込に直したあとの品物と支払合計）から、
 * 科目つきの経費の行を作る。**保存はしない**。
 */
export function buildReceiptIntake(params: {
  /** 税込に直したあとの品物（lib/receiptOcr.ts の items） */
  items: ReadItem[];
  /** 突き合わせの結果（lib/receiptOcr.ts の check） */
  check: Pick<ReconcileResult, "itemsSum" | "adjustedSum" | "adjusted" | "matched" | "reason">;
  /** レシートの支払合計（税込） */
  total: number;
  /** 業態のひな形（科目の対応表） */
  template: BusinessTemplate;
}): ReceiptIntake {
  const { items, check, total, template } = params;

  const rows: IntakeRow[] = (items ?? []).map((item) => {
    const description = descriptionOf(item);
    const { account, matched } = classifyExpense(description, template);
    return {
      description,
      amount: amountOf(item),
      account,
      accountLabel: accountLabel(account),
      matched,
    };
  });

  const rowsTotal = rows.reduce((s, r) => s + r.amount, 0);
  const unmatchedCount = rows.filter((r) => !r.matched).length;
  const totalMatched = check.matched && rowsTotal === total;

  const needsHuman =
    rows.length === 0 ||
    !totalMatched ||
    check.reason === "mismatch" ||
    check.reason === "no_total" ||
    unmatchedCount > 0;

  const message =
    rows.length === 0
      ? "⚠️ レシートから品物を1つも読み取れませんでした。写真を撮り直すか、金額を手で入れてください。"
      : reconcileMessage({
          items: [],
          total,
          itemsSum: check.itemsSum,
          adjustedSum: check.adjustedSum,
          adjusted: check.adjusted,
          matched: check.matched,
          reason: check.reason,
        });

  return {
    rows,
    total,
    rowsTotal,
    taxAdjusted: check.adjusted,
    totalMatched,
    unmatchedCount,
    needsHuman,
    reason: check.reason,
    message,
    ok: rows.length > 0 && totalMatched && unmatchedCount === 0,
  };
}

/** 科目ごとにまとめた金額（経理画面と同じ並べ方で見せるため） */
export function sumByAccount(intake: ReceiptIntake): { account: ExpenseAccountKey; label: string; amount: number }[] {
  const map = new Map<ExpenseAccountKey, number>();
  for (const r of intake.rows) map.set(r.account, (map.get(r.account) ?? 0) + r.amount);
  return [...map.entries()].map(([account, amount]) => ({
    account,
    label: accountLabel(account),
    amount,
  }));
}
