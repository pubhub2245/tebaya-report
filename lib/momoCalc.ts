/**
 * もも屋（および商品マスタ連動店）の主力商品の本数を売上から逆算する。
 *
 *  他商品売上 = Σ(通常商品の単価 × 本数)   ※お酒(count_only)は含めない
 *  主力売上   = 売上 − 他商品売上
 *  主力本数   = floor(主力売上 / 主力単価)
 */

export type SaleProduct = {
  id: number;
  shop: string;
  name: string;
  price: number;
  kind: "primary" | "normal" | "count_only";
  is_active: boolean;
  sort_order: number;
};

export type MomoCalcResult = {
  primaryName: string;
  primaryPrice: number;
  count: number;
  otherSales: number;
  primarySales: number;
  warning: string | null;
};

export function computeMomoPrimary(
  sales: number,
  products: SaleProduct[],
  counts: Record<string, number>,
): MomoCalcResult {
  const s = Math.max(0, Math.round(sales || 0));
  const primary = products.find((p) => p.kind === "primary");
  const normals = products.filter((p) => p.kind === "normal");

  const otherSales = normals.reduce(
    (sum, p) => sum + p.price * Math.max(0, counts[p.name] || 0),
    0,
  );
  const rawPrimarySales = s - otherSales;
  const primarySales = Math.max(0, rawPrimarySales);
  const count =
    primary && primary.price > 0
      ? Math.floor(primarySales / primary.price)
      : 0;

  return {
    primaryName: primary?.name ?? "",
    primaryPrice: primary?.price ?? 0,
    count,
    otherSales,
    primarySales: rawPrimarySales,
    warning:
      rawPrimarySales < 0
        ? "売上より他商品売上の方が大きいです。入力を確認してください"
        : !primary
          ? "主力商品（もも焼き等）が未登録です。管理者ページの商品マスタで登録してください"
          : null,
  };
}
