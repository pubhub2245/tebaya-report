/**
 * 仕込み日報（prep_*）系ヘルパー。
 *
 * - getActiveProducts: 当該日に有効な商品マスター
 * - getCarryoverFromYesterday: 前日の繰越（手羽先・餃子等）
 * - calculateTheoreticalPrepQuantity: 売上から逆算した理論仕込み量
 * - calculatePrepMinutes: speed_basis を考慮した所要分数計算
 * - getStaffPrepReport: 既存レポート + sessions + items + carryovers をまとめて取得
 */

import { supabase } from "./supabase";

export type SpeedBasis = "per_100" | "per_session" | "per_unit";

export type PrepProduct = {
  id: string;
  name: string;
  unit_label: string;
  speed_minutes: number;
  speed_basis: SpeedBasis;
  is_carryover_tracked: boolean;
  is_active: boolean;
  effective_from: string; // ISO date
  effective_until: string | null;
  display_order: number;
  notes: string | null;
};

export type PrepSettings = {
  id: string;
  effective_from: string;
  hourly_rate: number;
  monthly_target_hours: number;
  monthly_salary: number;
  tebasaki_per_10k_sales: number;
  gyoza_per_10k_sales: number;
  tebasaki_gyoza_sales_ratio: number;
  notes: string | null;
};

export type PrepSessionItemInput = {
  product_id: string;
  quantity: number;
};

export type PrepSessionInput = {
  session_label: string | null;
  start_time: string; // "HH:MM" or "HH:MM:SS"
  end_time: string;
  display_order: number;
  items: PrepSessionItemInput[];
};

export type PrepCarryoverInput = {
  product_id: string;
  quantity: number;
};

export type PrepReportRow = {
  id: string;
  date: string;
  staff_name: string;
  field_work_minutes: number;
  procurement_minutes: number;
  ordering_minutes: number;
  setup_minutes: number;
  other_minutes: number;
  other_description: string | null;
  memo: string | null;
};

export type PrepSessionRow = {
  id: string;
  prep_report_id: string;
  session_label: string | null;
  start_time: string;
  end_time: string;
  display_order: number;
};

export type PrepSessionItemRow = {
  id: string;
  prep_session_id: string;
  product_id: string;
  quantity: number;
};

export type PrepCarryoverRow = {
  id: string;
  date: string;
  product_id: string;
  quantity: number;
};

// ---------------------------------------------------------------------------
// 共通ユーティリティ
// ---------------------------------------------------------------------------

function toIsoDate(d: Date | string): string {
  if (typeof d === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    return new Date(d).toISOString().slice(0, 10);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return toIsoDate(dt);
}

// ---------------------------------------------------------------------------
// B-1. getActiveProducts
// ---------------------------------------------------------------------------

export async function getActiveProducts(date: Date | string): Promise<PrepProduct[]> {
  const iso = toIsoDate(date);
  const { data, error } = await supabase
    .from("prep_products")
    .select("*")
    .eq("is_active", true)
    .lte("effective_from", iso)
    .or(`effective_until.is.null,effective_until.gte.${iso}`)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    console.warn("[prepHelpers] getActiveProducts エラー", error);
    return [];
  }
  return (data as PrepProduct[]) ?? [];
}

// ---------------------------------------------------------------------------
// B-2. getCarryoverFromYesterday
// ---------------------------------------------------------------------------

export async function getCarryoverFromYesterday(
  date: Date | string,
): Promise<Array<{ product_id: string; quantity: number; product_name: string; unit_label: string }>> {
  const iso = toIsoDate(date);
  const yesterday = shiftDays(iso, -1);

  // is_carryover_tracked=true の商品の前日繰越を JOIN で取得
  const { data, error } = await supabase
    .from("prep_carryovers")
    .select("product_id, quantity, prep_products!inner(name, unit_label, is_carryover_tracked)")
    .eq("date", yesterday);
  if (error) {
    console.warn("[prepHelpers] getCarryoverFromYesterday エラー", error);
    return [];
  }
  // Supabase の JOIN 結果は型推論で配列扱いになるが実体は単一オブジェクトのことが多い。
  // ランタイム側で配列・オブジェクト両方に対応する。
  const rows = (data as unknown as Array<{
    product_id: string;
    quantity: number;
    prep_products:
      | { name: string; unit_label: string; is_carryover_tracked: boolean }
      | Array<{ name: string; unit_label: string; is_carryover_tracked: boolean }>
      | null;
  }>) ?? [];
  return rows
    .map((r) => {
      const pp = Array.isArray(r.prep_products) ? r.prep_products[0] : r.prep_products;
      if (!pp || !pp.is_carryover_tracked) return null;
      return {
        product_id: r.product_id,
        quantity: r.quantity,
        product_name: pp.name,
        unit_label: pp.unit_label,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

// ---------------------------------------------------------------------------
// 設定取得
// ---------------------------------------------------------------------------

export async function getPrepSettings(date: Date | string): Promise<PrepSettings | null> {
  const iso = toIsoDate(date);
  const { data, error } = await supabase
    .from("prep_settings")
    .select("*")
    .lte("effective_from", iso)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[prepHelpers] getPrepSettings エラー", error);
    return null;
  }
  return (data as PrepSettings) ?? null;
}

// ---------------------------------------------------------------------------
// B-3. calculateTheoreticalPrepQuantity
// ---------------------------------------------------------------------------

export type TheoreticalQty = {
  product_id: string;
  product_name: string;
  theoretical_quantity: number;
};

/**
 * 前日売上 → 当日の理論仕込み量。
 *
 * ロジック（prep_settings 由来）:
 *   tebasaki = sales × ratio × (tebasaki_per_10k / (tebasaki_per_10k + gyoza_per_10k))
 *   実本数換算は per_10k_sales を「売上1万円あたり○本」として直接使う:
 *     tebasaki_qty = sales × tebasaki_gyoza_sales_ratio × (tebasaki_per_10k_sales / 10000)
 *     gyoza_qty    = sales × tebasaki_gyoza_sales_ratio × (gyoza_per_10k_sales / 10000)
 */
export async function calculateTheoreticalPrepQuantity(
  date: Date | string,
): Promise<TheoreticalQty[]> {
  const iso = toIsoDate(date);
  const yesterday = shiftDays(iso, -1);

  // 前日売上集計
  const { data: sales, error: salesErr } = await supabase
    .from("daily_reports")
    .select("sales_amount")
    .eq("date", yesterday);
  if (salesErr) {
    console.warn("[prepHelpers] calculateTheoreticalPrepQuantity 売上取得エラー", salesErr);
    return [];
  }
  const totalSales = (sales ?? []).reduce(
    (s: number, r: { sales_amount: number | null }) => s + (r.sales_amount ?? 0),
    0,
  );
  if (totalSales === 0) return [];

  // 設定取得
  const settings = await getPrepSettings(iso);
  if (!settings) return [];

  // 商品取得
  const products = await getActiveProducts(iso);
  const tebasaki = products.find((p) => p.name === "手羽先");
  const gyoza = products.find((p) => p.name === "餃子");

  const out: TheoreticalQty[] = [];
  const ratio = Number(settings.tebasaki_gyoza_sales_ratio);
  const targetSales = totalSales * (Number.isFinite(ratio) ? ratio : 0.9);

  if (tebasaki) {
    const qty = Math.round((targetSales * settings.tebasaki_per_10k_sales) / 10000);
    out.push({
      product_id: tebasaki.id,
      product_name: tebasaki.name,
      theoretical_quantity: qty,
    });
  }
  if (gyoza) {
    const qty = Math.round((targetSales * settings.gyoza_per_10k_sales) / 10000);
    out.push({
      product_id: gyoza.id,
      product_name: gyoza.name,
      theoretical_quantity: qty,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// B-4. calculatePrepMinutes
// ---------------------------------------------------------------------------

/**
 * 商品ID → PrepProduct の Map を渡し、items から所要分数を集計。
 */
export function calculatePrepMinutes(
  items: PrepSessionItemInput[],
  productMap: Map<string, Pick<PrepProduct, "speed_basis" | "speed_minutes">>,
): number {
  let total = 0;
  for (const it of items) {
    const p = productMap.get(it.product_id);
    if (!p) continue;
    const qty = Math.max(0, it.quantity || 0);
    if (p.speed_basis === "per_100") {
      total += (qty / 100) * p.speed_minutes;
    } else if (p.speed_basis === "per_session") {
      // 数量に関わらず 1セッション分
      total += qty > 0 ? p.speed_minutes : 0;
    } else if (p.speed_basis === "per_unit") {
      total += qty * p.speed_minutes;
    }
  }
  return Math.round(total);
}

// ---------------------------------------------------------------------------
// B-5. getStaffPrepReport
// ---------------------------------------------------------------------------

export type StaffPrepBundle = {
  report: PrepReportRow | null;
  sessions: PrepSessionRow[];
  items: PrepSessionItemRow[];
  carryovers: PrepCarryoverRow[];
};

export async function getStaffPrepReport(
  date: Date | string,
  staffName: string,
): Promise<StaffPrepBundle> {
  const iso = toIsoDate(date);
  const empty: StaffPrepBundle = {
    report: null,
    sessions: [],
    items: [],
    carryovers: [],
  };

  const { data: reportRows, error: reportErr } = await supabase
    .from("prep_reports")
    .select("*")
    .eq("date", iso)
    .eq("staff_name", staffName)
    .maybeSingle();
  if (reportErr) {
    console.warn("[prepHelpers] getStaffPrepReport report エラー", reportErr);
    return empty;
  }
  const report = (reportRows as PrepReportRow) ?? null;

  // 当日繰越（記録対象は本人作成分）
  const { data: carryovers } = await supabase
    .from("prep_carryovers")
    .select("*")
    .eq("date", iso);

  if (!report) {
    return {
      report: null,
      sessions: [],
      items: [],
      carryovers: (carryovers as PrepCarryoverRow[]) ?? [],
    };
  }

  const { data: sessions } = await supabase
    .from("prep_sessions")
    .select("*")
    .eq("prep_report_id", report.id)
    .order("display_order", { ascending: true });

  const sessionList = (sessions as PrepSessionRow[]) ?? [];
  let items: PrepSessionItemRow[] = [];
  if (sessionList.length > 0) {
    const sessionIds = sessionList.map((s) => s.id);
    const { data: itemRows } = await supabase
      .from("prep_session_items")
      .select("*")
      .in("prep_session_id", sessionIds);
    items = (itemRows as PrepSessionItemRow[]) ?? [];
  }

  return {
    report,
    sessions: sessionList,
    items,
    carryovers: (carryovers as PrepCarryoverRow[]) ?? [],
  };
}
