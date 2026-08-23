/**
 * 仕込み計算で使う商品単価。
 *
 * 【注意】日報の売上内訳はここを使いません。
 * 内訳は商品マスタ（sale_products テーブル）の単価を使い、
 * その日に使った単価を日報にも控えとして保存しています（lib/salesBreakdown.ts）。
 *
 * ここに残っているのは「これから何本仕込むか」の目標計算用（lib/prepHelpers.ts）で、
 * 先の予定を計算するものなので常に最新の単価を入れておきます。
 * 値段を変えたときは、ここと商品マスタの両方を直してください。
 */

export const PRODUCT_PRICES = {
  TEBASAKI: 200,
  GYOZA: 300,
  POTATO: 350,
  TORNADO: 500,
  LIMITED: 250,
  ALLSTAR: 2000,
} as const;

export type ProductPriceKey = keyof typeof PRODUCT_PRICES;
