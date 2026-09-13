/**
 * 出店料（場代）の決まりを、出店場所マスタから取り出すところ。
 *
 * 計算そのものは `lib/money.ts` の `calcBoothFee()`（お金の計算は1か所・→ 4-1）。
 * ここは「マスタの行から、その場所の決まりを探す」係（データベースには触らない）。
 * マスタを読みに行くのは `lib/boothFeeMaster.ts`。
 *
 * ■ 大事なこと
 *   - 日報の場所名は書き方がバラバラなので、`canonicalLocationName` で
 *     名前を揃えてからマスタと突き合わせる（→ CLAUDE.md 4-4）。
 *   - **手羽屋・もも屋が同じ日・同じ場所に出ても、場代は1回だけ**。
 *     実データでも場代は手羽屋の日報にだけ入っている（→ 呼び出し側で判定）。
 */

import { canonicalLocationName } from "@/lib/locationName";
import type { BoothFeeRule } from "@/lib/money";

/** 出店場所マスタのうち、場代に使う列 */
export type BoothFeeLocation = {
  name: string;
  booth_fee_type: string | null;
  booth_fee_rate: number | string | null;
  booth_fee_amount: number | null;
};

/** マスタの1行を、計算に使える形にする */
export function toBoothFeeRule(row: BoothFeeLocation | null | undefined): BoothFeeRule {
  const type = row?.booth_fee_type;
  if (type === "percent")
    return { type: "percent", rate: Number(row?.booth_fee_rate) || 0 };
  if (type === "fixed")
    return { type: "fixed", amount: Number(row?.booth_fee_amount) || 0 };
  return { type: "none" };
}

/** 名寄せした場所名 → 決まり、の表を作る（純関数・DBに触らない） */
export function buildBoothFeeRules(
  rows: BoothFeeLocation[],
): Map<string, BoothFeeRule> {
  const map = new Map<string, BoothFeeRule>();
  for (const row of rows) {
    const key = canonicalLocationName(row.name);
    if (key) map.set(key, toBoothFeeRule(row));
  }
  return map;
}

/** 表から、その場所（書き方はバラバラでよい）の決まりを引く */
export function boothFeeRuleFor(
  rules: Map<string, BoothFeeRule>,
  locationName: string,
): BoothFeeRule {
  const key = canonicalLocationName(locationName);
  return (key && rules.get(key)) || { type: "none" };
}
