/**
 * 仕込み日報（prep_*）系ヘルパー。
 *
 * - getActiveProducts: 当該日に有効な商品マスター
 * - getCarryoverFromYesterday: 前日の繰越（手羽先・餃子等）
 * - calculateTheoreticalPrepQuantity: 明日の店舗target合計 − 当日繰越 から逆算した必要仕込み量
 * - calculatePrepMinutes: speed_basis を考慮した所要分数計算
 * - getStaffPrepReport: 既存レポート + sessions + items + carryovers をまとめて取得
 */

import { supabase } from "./supabase";
import { PRODUCT_PRICES } from "./productPrices";

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
  /** 直接費比率の警告ライン（未満で「警告」、デフォルト 0.85） */
  direct_cost_warning_threshold: number;
  /** 直接費比率の目標ライン（デフォルト 0.90） */
  direct_cost_target_threshold: number;
  /** 直接費比率の理想ライン（デフォルト 0.95） */
  direct_cost_ideal_threshold: number;
};

export type PrepSessionItemInput = {
  product_id: string;
  quantity: number;
};

export type PrepSessionInput = {
  session_label: string | null;
  /** 本数換算ベースへ移行済み。互換用に残すが null 可。 */
  start_time: string | null;
  end_time: string | null;
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
  start_time: string | null;
  end_time: string | null;
  display_order: number;
  prep_minutes: number;
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
  /** 必要仕込み量 = max(0, target - carryover) */
  theoretical_quantity: number;
  /** 明日の目標売上から逆算した必要本数（繰越控除前） */
  target: number;
  /** 当日の繰越本数（=今日の仕込み開始時点で残っている分） */
  carryover: number;
};

export type TheoreticalPrepShift = {
  location_name: string;
  rank: string;
  target: number;
};

export type TheoreticalPrepResult = {
  /** 集計対象日（=明日）の ISO 日付 */
  tomorrow: string;
  /** 明日の published シフト一覧（店舗・ランク・目標） */
  shifts: TheoreticalPrepShift[];
  /** 明日の target 合計 */
  total_target: number;
  /** 商品ごとの理論仕込み量（手羽先・餃子） */
  items: TheoreticalQty[];
};

/**
 * 明日の店舗 target 合計から逆算した必要仕込み量。
 *
 * ロジック:
 *   tomorrowTotalTarget = SUM(shifts.target WHERE date = date+1 AND status = 'published')
 *   prepTargetSales     = tomorrowTotalTarget × tebasaki_gyoza_sales_ratio
 *   tebasakiSales       = prepTargetSales × (tebasaki_per_10k / (tebasaki_per_10k + gyoza_per_10k))
 *   tebasakiTarget      = floor(tebasakiSales / PRODUCT_PRICES.TEBASAKI)
 *   tebasakiNeeded      = max(0, tebasakiTarget − 当日繰越(手羽先))
 *   餃子も同様。
 */
export async function calculateTheoreticalPrepQuantity(
  date: Date | string,
): Promise<TheoreticalPrepResult> {
  const iso = toIsoDate(date);
  const tomorrow = shiftDays(iso, 1);

  // 1. 明日のシフト
  const { data: shiftRows } = await supabase
    .from("shifts")
    .select("rank, target, locations(name)")
    .eq("date", tomorrow)
    .eq("status", "published");
  const shifts: TheoreticalPrepShift[] = ((shiftRows as Array<{
    rank: string | null;
    target: number | null;
    locations: { name: string } | Array<{ name: string }> | null;
  }>) ?? []).map((r) => {
    const loc = Array.isArray(r.locations) ? r.locations[0] : r.locations;
    return {
      location_name: loc?.name ?? "",
      rank: r.rank ?? "",
      target: r.target ?? 0,
    };
  });
  const totalTarget = shifts.reduce((s, r) => s + r.target, 0);

  if (totalTarget === 0) {
    return { tomorrow, shifts, total_target: 0, items: [] };
  }

  // 2. 設定取得
  const settings = await getPrepSettings(iso);
  if (!settings) {
    return { tomorrow, shifts, total_target: totalTarget, items: [] };
  }

  // 3. 商品取得
  const products = await getActiveProducts(iso);
  const tebasaki = products.find((p) => p.name === "手羽先");
  const gyoza = products.find((p) => p.name === "餃子");

  // 4. 手羽先・餃子の売上目標 → 本数換算
  const ratio = Number(settings.tebasaki_gyoza_sales_ratio);
  const prepTargetSales = totalTarget * (Number.isFinite(ratio) ? ratio : 0.9);
  const tebasakiPer = Number(settings.tebasaki_per_10k_sales) || 0;
  const gyozaPer = Number(settings.gyoza_per_10k_sales) || 0;
  const sumPer = tebasakiPer + gyozaPer;
  const tebasakiSales = sumPer > 0 ? prepTargetSales * (tebasakiPer / sumPer) : 0;
  const gyozaSales = sumPer > 0 ? prepTargetSales * (gyozaPer / sumPer) : 0;
  const tebasakiTarget = Math.floor(tebasakiSales / PRODUCT_PRICES.TEBASAKI);
  const gyozaTarget = Math.floor(gyozaSales / PRODUCT_PRICES.GYOZA);

  // 5. 当日繰越（手羽先・餃子のみ）
  const { data: coRows } = await supabase
    .from("prep_carryovers")
    .select("product_id, quantity")
    .eq("date", iso);
  const coMap = new Map<string, number>();
  for (const r of (coRows as Array<{ product_id: string; quantity: number }>) ?? []) {
    coMap.set(r.product_id, r.quantity);
  }

  const items: TheoreticalQty[] = [];
  if (tebasaki) {
    const carryover = coMap.get(tebasaki.id) ?? 0;
    items.push({
      product_id: tebasaki.id,
      product_name: tebasaki.name,
      target: tebasakiTarget,
      carryover,
      theoretical_quantity: Math.max(0, tebasakiTarget - carryover),
    });
  }
  if (gyoza) {
    const carryover = coMap.get(gyoza.id) ?? 0;
    items.push({
      product_id: gyoza.id,
      product_name: gyoza.name,
      target: gyozaTarget,
      carryover,
      theoretical_quantity: Math.max(0, gyozaTarget - carryover),
    });
  }

  return { tomorrow, shifts, total_target: totalTarget, items };
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

// ---------------------------------------------------------------------------
// 翌日繰越の自動計算
// ---------------------------------------------------------------------------

export type AutoCarryoverEntry = {
  product_id: string;
  product_name: string;
  unit_label: string;
  /** 自動計算された当日繰越（マイナスは0にクランプ） */
  calculated_quantity: number;
  /** 計算過程の文字列 */
  source_summary: string;
  /** 前々日繰越が見つかったか */
  has_prev_carryover: boolean;
  /** 前日の prep_report が見つかったか */
  has_yesterday_prep: boolean;
  /** 前日の daily_reports が見つかったか */
  has_yesterday_sales: boolean;
};

/**
 * 翌日繰越（=date 当日の繰越欄の初期値）を自動計算。
 *   翌日繰越 = 前々日繰越 + 前日仕込み量 - 前日使用量
 *
 * - date 当日の繰越欄の値を埋める用途のため、参照する「前々日」「前日」は
 *   date を起点にした date-2 / date-1。
 * - 各値の取得元：
 *     前々日繰越    : prep_carryovers.quantity   (date-2)
 *     前日仕込み量  : prep_session_items の合計   (date-1 の prep_reports に紐付くもの)
 *     前日使用量    : daily_reports
 *                       手羽先 → remaining_tebasaki
 *                       餃子   → remaining_gyoza
 *                       (それ以外は 0 として扱う)
 * - 対象は is_carryover_tracked=true の商品のみ。
 */
export async function calculateAutoCarryover(
  date: Date | string,
): Promise<AutoCarryoverEntry[]> {
  const iso = toIsoDate(date);
  const yesterday = shiftDays(iso, -1);
  const dayBefore = shiftDays(iso, -2);

  // 1. 対象商品（繰越管理）
  const { data: prodData } = await supabase
    .from("prep_products")
    .select("id, name, unit_label, is_carryover_tracked")
    .eq("is_carryover_tracked", true)
    .eq("is_active", true);
  const products = (prodData as Array<{
    id: string;
    name: string;
    unit_label: string;
  }>) ?? [];
  if (products.length === 0) return [];

  // 2. 前々日繰越
  const { data: prevCO } = await supabase
    .from("prep_carryovers")
    .select("product_id, quantity")
    .eq("date", dayBefore);
  const prevCOMap = new Map<string, number>();
  for (const r of (prevCO as Array<{ product_id: string; quantity: number }>) ??
    []) {
    prevCOMap.set(r.product_id, r.quantity);
  }

  // 3. 前日の prep_reports → sessions → items
  const { data: prepReportRows } = await supabase
    .from("prep_reports")
    .select("id")
    .eq("date", yesterday);
  const reportIds = ((prepReportRows as Array<{ id: string }>) ?? []).map(
    (r) => r.id,
  );
  const prepMap = new Map<string, number>();
  let hasYesterdayPrep = false;
  if (reportIds.length > 0) {
    hasYesterdayPrep = true;
    const { data: sessRows } = await supabase
      .from("prep_sessions")
      .select("id")
      .in("prep_report_id", reportIds);
    const sessIds = ((sessRows as Array<{ id: string }>) ?? []).map(
      (s) => s.id,
    );
    if (sessIds.length > 0) {
      const { data: itemRows } = await supabase
        .from("prep_session_items")
        .select("product_id, quantity")
        .in("prep_session_id", sessIds);
      for (const it of (itemRows as Array<{
        product_id: string;
        quantity: number;
      }>) ?? []) {
        prepMap.set(
          it.product_id,
          (prepMap.get(it.product_id) ?? 0) + it.quantity,
        );
      }
    }
  }

  // 4. 前日 daily_reports → 使用量（手羽先・餃子）
  const { data: dailyRows } = await supabase
    .from("daily_reports")
    .select("remaining_tebasaki, remaining_gyoza")
    .eq("date", yesterday);
  const dailyList = (dailyRows as Array<{
    remaining_tebasaki: number | null;
    remaining_gyoza: number | null;
  }>) ?? [];
  const totalTebasakiUsed = dailyList.reduce(
    (s, r) => s + (r.remaining_tebasaki ?? 0),
    0,
  );
  const totalGyozaUsed = dailyList.reduce(
    (s, r) => s + (r.remaining_gyoza ?? 0),
    0,
  );
  const hasYesterdaySales = dailyList.length > 0;

  // 5. 各商品の繰越を計算
  const out: AutoCarryoverEntry[] = [];
  for (const p of products) {
    const prevCarryover = prevCOMap.get(p.id) ?? 0;
    const prepMade = prepMap.get(p.id) ?? 0;
    let used = 0;
    if (p.name === "手羽先") used = totalTebasakiUsed;
    else if (p.name === "餃子") used = totalGyozaUsed;
    // それ以外の繰越管理商品は使用量0扱い

    const raw = prevCarryover + prepMade - used;
    const clamped = Math.max(0, raw);
    const summary = `${prevCarryover}(前繰) + ${prepMade}(仕込み) - ${used}(使用) = ${raw}${raw < 0 ? " → 0" : ""}`;

    out.push({
      product_id: p.id,
      product_name: p.name,
      unit_label: p.unit_label,
      calculated_quantity: clamped,
      source_summary: summary,
      has_prev_carryover: prevCOMap.has(p.id),
      has_yesterday_prep: hasYesterdayPrep,
      has_yesterday_sales: hasYesterdaySales,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 直接費比率の集計と判定
// ---------------------------------------------------------------------------

export type MonthlyCostBreakdown = {
  /** 直接費 = 仕込みセッション時間（end-start 合計） + field_work_minutes */
  direct_cost_minutes: number;
  /** 間接費 = procurement + ordering + setup + other */
  indirect_cost_minutes: number;
  total_minutes: number;
  /** 0.0〜1.0 */
  direct_cost_ratio: number;
  direct_cost_amount: number;
  indirect_cost_amount: number;
  total_cost_amount: number;
  /** 仕込みセッションの合計分数（end-start ベース） */
  prep_minutes: number;
  field_work_minutes: number;
  procurement_minutes: number;
  ordering_minutes: number;
  setup_minutes: number;
  other_minutes: number;
  /** 集計に含めた prep_reports 件数 */
  report_count: number;
};

function diffTimeToMinutes(start: string, end: string): number {
  // "HH:MM:SS" or "HH:MM" 形式を仮定
  const parse = (s: string) => {
    const parts = s.split(":").map((x) => parseInt(x, 10));
    const h = parts[0] ?? 0;
    const m = parts[1] ?? 0;
    return h * 60 + m;
  };
  const a = parse(start);
  const b = parse(end);
  return Math.max(0, b - a);
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * 月次の業務時間を「直接費（仕込みセッション + field_work）」と
 * 「間接費（procurement + ordering + setup + other）」に分けて集計。
 * 金額換算は hourly_rate を使用。
 */
export async function calculateMonthlyCostBreakdown(
  year: number,
  month: number,
  staffName?: string,
): Promise<MonthlyCostBreakdown> {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDayOfMonth(year, month)).padStart(2, "0")}`;

  const settings = await getPrepSettings(endDate);
  const hourlyRate = settings?.hourly_rate ?? 1000;

  let q = supabase
    .from("prep_reports")
    .select("*")
    .gte("date", startDate)
    .lte("date", endDate);
  if (staffName) q = q.eq("staff_name", staffName);
  const { data: reports } = await q;
  const reportList = (reports as PrepReportRow[]) ?? [];

  const empty: MonthlyCostBreakdown = {
    direct_cost_minutes: 0,
    indirect_cost_minutes: 0,
    total_minutes: 0,
    direct_cost_ratio: 0,
    direct_cost_amount: 0,
    indirect_cost_amount: 0,
    total_cost_amount: 0,
    prep_minutes: 0,
    field_work_minutes: 0,
    procurement_minutes: 0,
    ordering_minutes: 0,
    setup_minutes: 0,
    other_minutes: 0,
    report_count: 0,
  };

  if (reportList.length === 0) return empty;

  // 業務時間カテゴリ集計
  let fieldWork = 0;
  let procurement = 0;
  let ordering = 0;
  let setup = 0;
  let other = 0;
  for (const r of reportList) {
    fieldWork += r.field_work_minutes;
    procurement += r.procurement_minutes;
    ordering += r.ordering_minutes;
    setup += r.setup_minutes;
    other += r.other_minutes;
  }

  // 仕込みセッション時間（本数換算ベース：prep_minutes カラムを合算）
  const reportIds = reportList.map((r) => r.id);
  let prepMin = 0;
  if (reportIds.length > 0) {
    const { data: sessRows } = await supabase
      .from("prep_sessions")
      .select("prep_minutes")
      .in("prep_report_id", reportIds);
    for (const s of (sessRows as Array<{ prep_minutes: number | null }>) ??
      []) {
      prepMin += s.prep_minutes ?? 0;
    }
  }

  const direct = prepMin + fieldWork;
  const indirect = procurement + ordering + setup + other;
  const total = direct + indirect;
  const ratio = total > 0 ? direct / total : 0;

  return {
    direct_cost_minutes: direct,
    indirect_cost_minutes: indirect,
    total_minutes: total,
    direct_cost_ratio: ratio,
    direct_cost_amount: Math.round((direct / 60) * hourlyRate),
    indirect_cost_amount: Math.round((indirect / 60) * hourlyRate),
    total_cost_amount: Math.round((total / 60) * hourlyRate),
    prep_minutes: prepMin,
    field_work_minutes: fieldWork,
    procurement_minutes: procurement,
    ordering_minutes: ordering,
    setup_minutes: setup,
    other_minutes: other,
    report_count: reportList.length,
  };
}

export type DirectCostStatus = {
  level: "warning" | "caution" | "target" | "ideal";
  label: string;
  /** Tailwind カラー名（red/amber/yellow/emerald） */
  color: "red" | "amber" | "yellow" | "emerald";
};

export function getDirectCostStatus(
  ratio: number,
  settings: Pick<
    PrepSettings,
    | "direct_cost_warning_threshold"
    | "direct_cost_target_threshold"
    | "direct_cost_ideal_threshold"
  >,
): DirectCostStatus {
  const w = Number(settings.direct_cost_warning_threshold ?? 0.85);
  const t = Number(settings.direct_cost_target_threshold ?? 0.9);
  const i = Number(settings.direct_cost_ideal_threshold ?? 0.95);
  if (ratio < w) return { level: "warning", label: "警告", color: "red" };
  if (ratio < t) return { level: "caution", label: "注意", color: "amber" };
  if (ratio < i) return { level: "target", label: "目標達成", color: "yellow" };
  return { level: "ideal", label: "理想達成", color: "emerald" };
}
