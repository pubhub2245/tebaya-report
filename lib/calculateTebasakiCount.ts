/**
 * 売上から逆算した手羽先使用本数の計算。
 *
 *  1. 他商品売上 = 餃子×250 + ポテト×300 + トルネード×500 + 限定×200 + オールスター×1300
 *  2. 手羽先売上 = sales_amount − 他商品売上
 *  3. 手羽先売上 < 0 なら警告
 *  4. 手羽先本数 = Math.floor(手羽先売上 / PRODUCT_PRICES.TEBASAKI)
 */

import { PRODUCT_PRICES } from "./productPrices";

export type TebasakiCalcInput = {
  sales_amount: number;
  gyoza_count: number;
  potato_count: number;
  tornado_count: number;
  limited_count: number;
  allstar_count?: number;
};

export type TebasakiCalcResult = {
  count: number;
  /** 計算過程の文字列（UI に表示用） */
  calculation_breakdown: string;
  /** 異常時の警告メッセージ。正常なら null */
  warning: string | null;
  /** 手羽先売上（負なら 0 にクランプ前の値） */
  tebasaki_sales: number;
  /** 他商品の合計売上 */
  other_sales: number;
};

function yenStr(n: number): string {
  return `¥${Math.round(n).toLocaleString()}`;
}

export function calculateTebasakiCount(
  input: TebasakiCalcInput,
): TebasakiCalcResult {
  const sales = Math.max(0, Math.round(input.sales_amount || 0));
  const gyoza = Math.max(0, Math.round(input.gyoza_count || 0));
  const potato = Math.max(0, Math.round(input.potato_count || 0));
  const tornado = Math.max(0, Math.round(input.tornado_count || 0));
  const limited = Math.max(0, Math.round(input.limited_count || 0));
  const allstar = Math.max(0, Math.round(input.allstar_count || 0));

  const gyozaSales = gyoza * PRODUCT_PRICES.GYOZA;
  const potatoSales = potato * PRODUCT_PRICES.POTATO;
  const tornadoSales = tornado * PRODUCT_PRICES.TORNADO;
  const limitedSales = limited * PRODUCT_PRICES.LIMITED;
  const allstarSales = allstar * PRODUCT_PRICES.ALLSTAR;
  const otherSales =
    gyozaSales + potatoSales + tornadoSales + limitedSales + allstarSales;

  const tebasakiSales = sales - otherSales;

  // 計算式テキスト（0数量の項目はスキップ）
  const parts: string[] = [`売上${yenStr(sales)}`];
  if (gyoza > 0) parts.push(`餃子${yenStr(gyozaSales)}`);
  if (potato > 0) parts.push(`ポテト${yenStr(potatoSales)}`);
  if (tornado > 0) parts.push(`トルネード${yenStr(tornadoSales)}`);
  if (limited > 0) parts.push(`限定${yenStr(limitedSales)}`);
  if (allstar > 0) parts.push(`オールスター${yenStr(allstarSales)}`);
  const subtractExpr =
    parts.length === 1 ? parts[0] : `${parts[0]} − ${parts.slice(1).join(" − ")}`;

  if (tebasakiSales < 0) {
    return {
      count: 0,
      calculation_breakdown: `${subtractExpr} = 手羽先${yenStr(tebasakiSales)}（マイナス）`,
      warning:
        "売上より他商品売上の方が大きいです、入力を確認してください",
      tebasaki_sales: tebasakiSales,
      other_sales: otherSales,
    };
  }

  const count = Math.floor(tebasakiSales / PRODUCT_PRICES.TEBASAKI);
  const breakdown = `${subtractExpr} = 手羽先${yenStr(tebasakiSales)} ÷ ${yenStr(PRODUCT_PRICES.TEBASAKI)} = ${count}本`;

  return {
    count,
    calculation_breakdown: breakdown,
    warning: null,
    tebasaki_sales: tebasakiSales,
    other_sales: otherSales,
  };
}
