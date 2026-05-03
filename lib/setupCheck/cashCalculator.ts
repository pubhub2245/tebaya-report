import type { CashCoinCounts } from "./types";

/** 額面（円） */
export const DENOMINATIONS = {
  c1: 1,
  c5: 5,
  c10: 10,
  c50: 50,
  c100: 100,
  c500: 500,
  b1000: 1000,
  b5000: 5000,
  b10000: 10000,
} as const;

export type DenomKey = keyof typeof DENOMINATIONS;

/** 入力UIで表示する順序（小→大） */
export const DENOM_ORDER: DenomKey[] = [
  "c1",
  "c5",
  "c10",
  "c50",
  "c100",
  "c500",
  "b1000",
  "b5000",
  "b10000",
];

/** 金種別枚数から合計額を計算 */
export function calculateCashTotal(coins: CashCoinCounts): number {
  let total = 0;
  for (const key of DENOM_ORDER) {
    const count = coins[key] ?? 0;
    if (Number.isFinite(count) && count > 0) {
      total += DENOMINATIONS[key] * count;
    }
  }
  return total;
}

/** 各金種の小計（入力 > 0 のもののみ） */
export function calculateBreakdown(coins: CashCoinCounts): Array<{
  key: DenomKey;
  denomination: number;
  count: number;
  subtotal: number;
}> {
  const out: Array<{
    key: DenomKey;
    denomination: number;
    count: number;
    subtotal: number;
  }> = [];
  for (const key of DENOM_ORDER) {
    const count = coins[key] ?? 0;
    if (count > 0) {
      out.push({
        key,
        denomination: DENOMINATIONS[key],
        count,
        subtotal: DENOMINATIONS[key] * count,
      });
    }
  }
  return out;
}

/** 額面ラベル（"10円" / "1,000円札"） */
export function formatDenominationLabel(denom: number): string {
  if (denom < 1000) return `${denom}円`;
  return `${denom.toLocaleString()}円札`;
}

/** 前回比較。previous が null なら no_previous。 */
export function compareWithPrevious(
  currentTotal: number,
  previousTotal: number | null,
): { diff: number | null; status: "match" | "diff" | "no_previous" } {
  if (previousTotal === null || previousTotal === undefined) {
    return { diff: null, status: "no_previous" };
  }
  const diff = currentTotal - previousTotal;
  return { diff, status: diff === 0 ? "match" : "diff" };
}
