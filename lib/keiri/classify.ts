/**
 * 経費の「自由入力の文字」から科目を決める仕組み。共通部分。
 *
 * ■ なぜ必要か
 *   日報の経費には「種類」を選ぶ欄がありません（docs/keiri.md 1-2）。
 *   入っているのは「場代」「肉代」「レジ袋」のような、人が手で打った文字だけです。
 *   そこで、**文字の中に含まれる言葉**から科目を推測します。
 *
 * ■ ルール
 *   - 対応表を**上から順**に見て、最初に当たったものを採用する（順番が意味を持つ）。
 *   - どれにも当たらなければ「雑費」。その件数は画面に出して、あとから直せるようにする。
 */

import { FALLBACK_ACCOUNT, type ExpenseAccountKey } from "./accounts";
import type { BusinessTemplate, ExpenseItem } from "./types";

/**
 * 比べる前に文字を揃える。
 * - 前後の空白を落とす
 * - 全角の英数字・記号を半角に直す（「ＡＢＣ」→「abc」）
 * - 英字は小文字に
 *
 * 「ＥＴＣ」と「etc」を同じ言葉として扱うため。
 */
export function normalizeText(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/[！-～]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
    )
    .toLowerCase();
}

/** 振り分けの結果 */
export type Classified = {
  account: ExpenseAccountKey;
  /** 対応表に当たったか。false＝当たらなかったので雑費に入れた */
  matched: boolean;
};

/**
 * 経費1件の説明文から科目を決める。
 * 当たらなければ雑費（matched: false）。
 */
export function classifyExpense(
  description: string | null | undefined,
  template: BusinessTemplate,
): Classified {
  const text = normalizeText(description);
  if (!text) return { account: FALLBACK_ACCOUNT, matched: false };

  for (const rule of template.expenseRules) {
    for (const kw of rule.keywords) {
      const needle = normalizeText(kw);
      if (needle && text.includes(needle)) {
        return { account: rule.account, matched: true };
      }
    }
  }
  return { account: FALLBACK_ACCOUNT, matched: false };
}

/** 経費の明細（jsonb）を、安全に配列として取り出す */
export function expenseItemsOf(expenses: unknown): ExpenseItem[] {
  if (!Array.isArray(expenses)) return [];
  return expenses.filter((e): e is ExpenseItem => !!e && typeof e === "object");
}

/** 金額を数値にする。おかしな値は0にして画面を止めない */
export function amountOf(item: ExpenseItem): number {
  return Number(item?.amount) || 0;
}
