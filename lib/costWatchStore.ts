/**
 * 原価率の見張り — データの出し入れ担当（計算は lib/costWatch.ts）。
 *
 * ■ 大事なこと
 *   - **日報の保存を絶対に邪魔しない。** ここで何が起きても握りつぶして空の文を返す
 *     （locationRankUpdate と同じ考え方）。日報の保存が終わってから呼ぶ。
 *   - 手羽屋（tenant_id が空）だけで使う。
 */

import { supabase } from "@/lib/supabase";
import {
  costAlerts,
  costAlertText,
  newUnitPrices,
  observePrices,
  priceChanges,
  productCosts,
  type CostMaterial,
  type CostProduct,
  type CostRecipeLine,
} from "@/lib/costWatch";

export type CostData = {
  materials: (CostMaterial & { price_updated_on: string | null; price_source: string | null; note: string | null; sort_order: number })[];
  recipe: (CostRecipeLine & { id: string })[];
  targets: Map<number, number>;
  products: CostProduct[];
};

export async function loadCostData(): Promise<CostData> {
  const [m, r, t, p] = await Promise.all([
    supabase
      .from("cost_materials")
      .select("id, name, unit, unit_price, keywords, price_updated_on, price_source, note, sort_order")
      .is("tenant_id", null)
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("cost_recipes").select("id, product_id, material_id, yield_per_unit"),
    supabase.from("cost_targets").select("product_id, target_ratio"),
    supabase
      .from("sale_products")
      .select("id, name, price, kind, sort_order")
      .eq("shop", "手羽屋")
      .is("tenant_id", null)
      .eq("is_active", true)
      .order("sort_order"),
  ]);
  if (m.error) throw m.error;
  if (r.error) throw r.error;
  return {
    materials: (m.data ?? []).map((x: any) => ({
      ...x,
      unit_price: x.unit_price === null ? null : Number(x.unit_price),
      keywords: x.keywords ?? [],
    })),
    recipe: (r.data ?? []).map((x: any) => ({ ...x, yield_per_unit: Number(x.yield_per_unit) })),
    targets: new Map((t.data ?? []).map((x: any) => [Number(x.product_id), Number(x.target_ratio)])),
    products: (p.data ?? [])
      .filter((x: any) => x.kind !== "count_only" && Number(x.price) > 0)
      .map((x: any) => ({ id: Number(x.id), name: x.name, price: Number(x.price) })),
  };
}

export function priceMap(materials: CostMaterial[]): Map<string, number | null> {
  return new Map(materials.map((m) => [m.id, m.unit_price]));
}

/**
 * 日報を保存したあとに呼ぶ。レシートの行から材料の単価を拾って記録し、
 * 単価を書き換え、知らせる商品があれば LINE に添える文を返す（無ければ空文字）。
 */
export async function watchCostsFromReport(args: {
  reportId: string | null;
  date: string;
  expenses: { description: string; amount: number; booth_fee?: boolean }[];
}): Promise<string> {
  try {
    const data = await loadCostData();
    if (data.materials.length === 0) return "";
    const obs = observePrices(args.expenses, data.materials);
    if (obs.length === 0) return "";

    await supabase.from("cost_price_log").insert(
      obs.map((o) => ({
        material_id: o.material_id,
        observed_on: args.date,
        report_id: args.reportId,
        description: o.description,
        amount: o.amount,
        qty: o.qty,
        unit_price: o.unit_price,
        applied: o.applied,
        reason: o.reason,
      })),
    );

    const next = newUnitPrices(obs);
    if (next.size === 0) return "";

    // 出し忘れた日の日報（前の日付）で、新しい単価を古い単価で上書きしない
    const latest = data.materials.filter((m) => next.has(m.id) && (!m.price_updated_on || m.price_updated_on <= args.date));
    if (latest.length === 0) return "";
    const nextLatest = new Map(latest.map((m) => [m.id, next.get(m.id)!]));

    const names = new Map(data.materials.map((m) => [m.id, m.name]));
    const beforePrices = priceMap(data.materials);
    const afterPrices = new Map(beforePrices);
    nextLatest.forEach((v, id) => afterPrices.set(id, v));
    const before = productCosts(data.products, data.recipe, beforePrices, names, data.targets);
    const after = productCosts(data.products, data.recipe, afterPrices, names, data.targets);
    const changes = priceChanges(data.materials, nextLatest);

    for (const m of latest) {
      await supabase
        .from("cost_materials")
        .update({
          unit_price: nextLatest.get(m.id),
          price_updated_on: args.date,
          price_source: "receipt",
          updated_at: new Date().toISOString(),
        })
        .eq("id", m.id);
    }
    return costAlertText(costAlerts(before, after, changes, data.recipe));
  } catch (e) {
    console.error("[costWatch] 見張りをとばしました（日報は保存済み）", e);
    return "";
  }
}
