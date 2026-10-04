/**
 * 経理の数字を出すために倉庫（Supabase）から読むところ。**読むだけ**。
 *
 * ■ なぜ分けたか（2026-10-04・kp231）
 *   経理画面（/keiri）の中に「読む手順」が直接書かれていました。
 *   実際のお店にお渡しする1枚（/keiri/monthly）でも同じものを読むのですが、
 *   読む手順をもう1つ書くと、**どちらかを直したときに2つの画面で数字が変わります**。
 *   そこで読む手順をこのファイル1つに寄せ、両方ここを通すようにしました。
 *
 * ■ 守ること
 *   ・日報は keiri_reports（レシート写真の住所を抜いた軽い見え方）から読む。
 *     daily_reports から直接読むと1か月で数百KBになる（CLAUDE.md 4-2）。
 *   ・立替の2つの棚には「どの店のものか」の印がまだ無いので、
 *     **手羽屋として開いているときだけ**読む（よその店に混ざらないように）。
 *   ・書き込みは一切しない。
 */

import { supabase } from "../supabase";
import { applyTenantScope, isTebayaScope, type TenantScope } from "../tenantScope";
import { normalizeFieldAdvance, normalizeOwnerAdvance } from "./advances";
import type {
  KeiriAdvance,
  KeiriPayment,
  KeiriReport,
  KeiriSettings,
} from "./types";

export type KeiriMonthData = {
  settings: KeiriSettings;
  /** そのお店ぶんの「設定の行」が見つからなかったか（手羽屋には起きない） */
  settingsMissing: boolean;
  reports: KeiriReport[];
  payments: (KeiriPayment & { id: number })[];
  advances: KeiriAdvance[];
};

export async function loadKeiriMonth(params: {
  /** 見ている月（YYYY-MM） */
  ym: string;
  /** いまどのお店として開いているか（null＝手羽屋） */
  scope: TenantScope;
  /** 業態コード（手羽屋は "tebaya"） */
  businessCode: string;
  /** 設定の行が無いときに使う値 */
  fallbackSettings: KeiriSettings;
}): Promise<KeiriMonthData> {
  const { ym, scope, businessCode, fallbackSettings } = params;

  // 設定（数え始めの日・期首残高・Alphaの率・家賃）
  const { data: s, error: sErr } = await supabase
    .from("keiri_settings")
    .select(
      "opening_date, opening_balance, outsourcing_rate, monthly_rent, rent_start_month",
    )
    .eq("business_type_code", businessCode)
    .maybeSingle();
  if (sErr) throw sErr;

  const settings: KeiriSettings = s
    ? {
        opening_date: (s as any).opening_date,
        opening_balance: Number((s as any).opening_balance) || 0,
        outsourcing_rate: Number((s as any).outsourcing_rate) || 0,
        monthly_rent: Number((s as any).monthly_rent) || 0,
        rent_start_month: (s as any).rent_start_month ?? "",
      }
    : fallbackSettings;

  const from = (s as any)?.opening_date ?? fallbackSettings.opening_date;
  // 表示中の月が期首日より前でも見られるように、月初とどちらか早いほうから取る
  const gte = `${ym}-01` < from ? `${ym}-01` : from;

  // 日報。経費の種類を決めるのに「説明の文字」が要るので明細も取る。
  const repQuery = supabase
    .from("keiri_reports")
    .select("date, location, staff_name, sales_amount, labor, expenses");
  const { data: reps, error: rErr } = await applyTenantScope<any>(repQuery as any, scope)
    .gte("date", gte)
    .order("date");
  if (rErr) throw rErr;

  // 支払い記録
  const { data: pays, error: pErr } = await supabase
    .from("keiri_payments")
    .select("id, paid_on, amount, kind, memo")
    .eq("business_type_code", businessCode)
    .order("paid_on", { ascending: false });
  if (pErr) throw pErr;

  // 立替。棚が2つあり（現場／経営側）、列の名前も違うので形を揃えてから使う。
  const advances: KeiriAdvance[] = [];
  if (isTebayaScope(scope)) {
    const { data: field } = await supabase
      .from("keiri_advance_expenses")
      .select("expense_date, amount, payer, source_type, memo")
      .eq("business_type_code", businessCode)
      .gte("expense_date", gte);
    for (const row of (field as any[]) ?? []) {
      advances.push(normalizeFieldAdvance(row));
    }
    const { data: owner } = await supabase
      .from("advance_expenses")
      .select("date, amount, payer, description, settled, settled_date")
      .gte("date", gte);
    for (const row of (owner as any[]) ?? []) {
      advances.push(normalizeOwnerAdvance(row));
    }
  }

  return {
    settings,
    settingsMissing: !s,
    reports: (reps as KeiriReport[]) ?? [],
    payments: (pays as (KeiriPayment & { id: number })[]) ?? [],
    advances,
  };
}
