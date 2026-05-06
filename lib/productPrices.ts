/**
 * 商品単価の一元管理。
 *
 * 売上から手羽先本数を逆算する計算で使う。
 * 限定商品の単価が変わる場合はここを変更する（一律 ¥200 ハードコード方針）。
 */

export const PRODUCT_PRICES = {
  TEBASAKI: 150,
  GYOZA: 250,
  POTATO: 300,
  TORNADO: 500,
  LIMITED: 200,
} as const;

export type ProductPriceKey = keyof typeof PRODUCT_PRICES;
