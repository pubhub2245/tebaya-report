/**
 * 月次限定商品（monthly_limited_products テーブル）アクセスヘルパー。
 *
 * 日報フォームと管理画面の両方から使う薄いラッパー。
 */

import { supabase } from "./supabase";

export type MonthlyLimitedProduct = {
  id: string;
  year: number;
  month: number;
  product_name: string;
  /** その月の限定商品の単価（円）。月によって変わるので月ごとに持つ。 */
  price: number;
  created_at: string | null;
  updated_at: string | null;
};

/** "YYYY-MM-DD" or Date から (year, month) を取り出す */
function extractYearMonth(input: Date | string): { year: number; month: number } {
  if (input instanceof Date) {
    return { year: input.getFullYear(), month: input.getMonth() + 1 };
  }
  const m = input.match(/^(\d{4})-(\d{2})/);
  if (m) {
    return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) };
  }
  // フォールバック: Date でパース
  const d = new Date(input);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/**
 * 指定日が属する月の限定商品を取得。
 * 該当する設定がなければ null。
 */
export async function getLimitedProductForMonth(
  input: Date | string,
): Promise<MonthlyLimitedProduct | null> {
  const { year, month } = extractYearMonth(input);
  const { data, error } = await supabase
    .from("monthly_limited_products")
    .select("*")
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();
  if (error) {
    console.warn("[limitedProduct] 取得失敗", error);
    return null;
  }
  if (!data) return null;
  return { ...(data as MonthlyLimitedProduct), price: (data as any).price ?? 0 };
}

/**
 * 過去〜未来の任意期間の限定商品を取得（管理画面用）。
 * fromYear/fromMonth から toYear/toMonth まで。
 */
export async function listLimitedProducts(opts?: {
  fromYear?: number;
  fromMonth?: number;
  toYear?: number;
  toMonth?: number;
}): Promise<MonthlyLimitedProduct[]> {
  const { data, error } = await supabase
    .from("monthly_limited_products")
    .select("*")
    .order("year", { ascending: false })
    .order("month", { ascending: false });
  if (error) {
    console.warn("[limitedProduct] 一覧取得失敗", error);
    return [];
  }
  let rows = ((data as MonthlyLimitedProduct[]) ?? []).map((r) => ({
    ...r,
    price: (r as any).price ?? 0,
  }));
  if (opts) {
    const inRange = (r: MonthlyLimitedProduct) => {
      if (opts.fromYear && opts.fromMonth) {
        const lower = opts.fromYear * 12 + opts.fromMonth;
        if (r.year * 12 + r.month < lower) return false;
      }
      if (opts.toYear && opts.toMonth) {
        const upper = opts.toYear * 12 + opts.toMonth;
        if (r.year * 12 + r.month > upper) return false;
      }
      return true;
    };
    rows = rows.filter(inRange);
  }
  return rows;
}

/**
 * 月次限定商品を UPSERT 保存。空文字を保存しようとした場合は削除する。
 */
export async function upsertLimitedProduct(
  year: number,
  month: number,
  productName: string,
  price = 0,
): Promise<{ success: boolean; error?: string }> {
  const trimmed = (productName ?? "").trim();

  if (trimmed === "") {
    // 空文字は「設定なし」とみなして削除
    const { error } = await supabase
      .from("monthly_limited_products")
      .delete()
      .eq("year", year)
      .eq("month", month);
    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  const { error } = await supabase
    .from("monthly_limited_products")
    .upsert(
      {
        year,
        month,
        product_name: trimmed,
        price: Math.max(0, Math.round(price || 0)),
      },
      { onConflict: "year,month" },
    );
  if (error) return { success: false, error: error.message };
  return { success: true };
}
