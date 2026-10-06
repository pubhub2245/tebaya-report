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
 *   ・日報の「お店の区分」（shop＝手羽屋／もも屋）も一緒に読む。どのお店の日報を
 *     数えているかを画面に出すため（kp234・f1-5）。**しぼり込みはここではしない**
 *     （既定は今までどおり全部。しぼるのは画面側で lib/keiri/shopScope.ts を使う）。
 *   ・立替の2つの棚には「どの店のものか」の印がまだ無いので、
 *     **手羽屋として開いているときだけ**読む（よその店に混ざらないように）。
 *   ・書き込みは一切しない。
 */

import { supabase } from "../supabase";
import { applyTenantScope, isTebayaScope, type TenantScope } from "../tenantScope";
import { readKeiriSecret } from "./browserSecret";
import { normalizeFieldAdvance, normalizeOwnerAdvance } from "./advances";
import { normalizeCashEvents, type CashEvent } from "./cashCheck";
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
  /**
   * 金庫を数えた記録と、銀行に入れた記録（kp233・f1-4）。
   * ★棚（keiri_cash_events）がまだ無い倉庫でも落ちないように、
   *   読めなければ**空のまま**にする（＝画面は今までどおり何も出さない）。
   */
  cashEvents: CashEvent[];
  /** 棚がまだ無い（＝貼り紙を流していない）か */
  cashShelfMissing: boolean;
};

/**
 * 申し込んだお店ぶんを、**サーバー側の窓口**（/api/keiri/month）から読む（kp239・f3-4）。
 *
 * ■ なぜこちらを先に使うか（やさしい説明）
 *   ブラウザから倉庫を直接のぞく読み方は、「どのお店として読むか」を
 *   **ブラウザが覚えている番号**で決めています。番号を書き換えれば、
 *   よそのお店の帳簿が開けてしまう形です。
 *   窓口は番号を受け取らず、**合言葉からサーバーが決める**ので、そこが閉まります。
 *
 * ■ 使えないときは、今までどおりの読み方に戻します
 *   札が無い・窓口が無い・通信できない——どの場合も null を返し、
 *   呼んだ側が今までの道へ落とします。**払ったお店が締め出されないため**です。
 *
 * ■ 手羽屋はここを通りません（今までどおり）
 */
async function loadViaServerWindow(params: {
  ym: string;
  fallbackSettings: KeiriSettings;
}): Promise<KeiriMonthData | null> {
  const passwordHash = readKeiriSecret();
  if (!passwordHash) return null;

  let json: any = null;
  try {
    const res = await fetch("/api/keiri/month", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ym: params.ym, passwordHash }),
    });
    json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) return null;
  } catch {
    return null;
  }

  const d = json.data ?? {};
  // ★読めなかった棚を「0件」と取り違えない（経費が落ちて利益が多く出るのを防ぐ）
  if (d.reportsUnreadable) {
    throw new Error("日報を読めませんでした。少し待ってから開き直してください。");
  }
  if (d.advancesUnreadable) {
    throw new Error("立替の記録を読めませんでした。少し待ってから開き直してください。");
  }

  return {
    settings: d.settingsMissing ? params.fallbackSettings : (d.settings as KeiriSettings),
    settingsMissing: !!d.settingsMissing,
    reports: (d.reports as KeiriReport[]) ?? [],
    payments: (d.payments as (KeiriPayment & { id: number })[]) ?? [],
    advances: (d.advances as KeiriAdvance[]) ?? [],
    cashEvents: (d.cashEvents as CashEvent[]) ?? [],
    cashShelfMissing: !!d.cashShelfMissing,
  };
}

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

  // ★申し込んだお店は、まずサーバー側の窓口から読む（kp239・f3-4）。
  //   窓口が使えないときだけ、今までどおりブラウザから読む道に落ちる。
  //   手羽屋（印が空）はここを通らず、今までと1行も変わらない。
  if (!isTebayaScope(scope)) {
    const viaServer = await loadViaServerWindow({ ym, fallbackSettings });
    if (viaServer) return viaServer;
  }

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
    .select("date, location, staff_name, shop, sales_amount, labor, expenses");
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

  // 金庫を数えた記録・銀行に入れた記録。
  // ★棚がまだ無い倉庫では、ここで落とさずに「棚が無い」とだけ覚えて先へ進む。
  //   流す前の本番が今までどおり動くための肝（kp237 ⑤）。
  let cashEvents: CashEvent[] = [];
  let cashShelfMissing = false;
  {
    const cashQuery = supabase
      .from("keiri_cash_events")
      .select("kind, happened_on, amount, actor, note");
    const { data: cash, error: cErr } = await applyTenantScope<any>(cashQuery as any, scope)
      .gte("happened_on", gte)
      .order("happened_on", { ascending: false });
    if (cErr) {
      cashShelfMissing = true;
    } else {
      cashEvents = normalizeCashEvents((cash as unknown[]) ?? []);
    }
  }

  return {
    settings,
    settingsMissing: !s,
    reports: (reps as KeiriReport[]) ?? [],
    payments: (pays as (KeiriPayment & { id: number })[]) ?? [],
    advances,
    cashEvents,
    cashShelfMissing,
  };
}
