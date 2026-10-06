/**
 * 経理の数字を、**サーバー側で**倉庫（Supabase）から読むところ。**読むだけ**。
 *
 * ■ なぜ要るか（2026-10-05）
 *   読む手順はもともと lib/keiri/loadMonth.ts の1つにまとめてありますが、
 *   あちらは**ブラウザの中で動く形**です（経理画面と、毎月お渡しする1枚が使う）。
 *   いっぽう「店主に見せる事例ページ」と「外から確かめる窓口」は
 *   **サーバー側で**同じ数字を出す必要があり、同じ読み方をもう1回書くと
 *   **どちらかを直したときに数字が割れます**（まさに 2026-10-05 に
 *   事例ページの利益が 51万円 ずれていた原因がこれでした）。
 *   そこで、サーバー側の読み方も**このファイル1つ**に寄せます。
 *
 * ■ 守ること
 *   ・日報は keiri_reports（レシート写真の住所を抜いた軽い見え方）から読む（CLAUDE.md 4-2）
 *   ・読めなかった棚は「読めなかった」と正直に返す。**空っぽ（0件）と取り違えない**
 *     （立替が読めないまま数えると、経費がまるごと落ちて利益が多く出る）
 *   ・書き込みは一切しない
 *   ・手羽屋の日報・シフト・レジ・LINE には触れない
 */

import { serverClient } from "@/lib/supabaseServer";
import {
  applyTenantScope,
  businessCodeForScope,
  isTebayaScope,
  TEBAYA_SCOPE,
  type TenantScope,
} from "@/lib/tenantScope";
import { normalizeFieldAdvance, normalizeOwnerAdvance } from "@/lib/keiri/advances";
import { normalizeCashEvents, type CashEvent } from "@/lib/keiri/cashCheck";
import { defaultSettingsFor } from "@/lib/keiri/index";
import type {
  KeiriAdvance,
  KeiriPayment,
  KeiriReport,
  KeiriSettings,
} from "@/lib/keiri/types";

export type KeiriMonthServerData = {
  settings: KeiriSettings;
  /** 設定の行が倉庫に見つからなかったか（家賃・外注費の率が当てずっぽうになる） */
  settingsMissing: boolean;
  reports: KeiriReport[];
  /** 日報が1件も読めなかったか（通信の失敗も含む） */
  reportsUnreadable: boolean;
  payments: KeiriPayment[];
  advances: KeiriAdvance[];
  /** 立替の棚が読めなかったか。**空っぽと取り違えない** */
  advancesUnreadable: boolean;
  cashEvents: CashEvent[];
  /** 金庫の記録の棚がまだ無いか（貼り紙を流していない） */
  cashShelfMissing: boolean;
  /**
   * 立替の棚を**読まずに飛ばした**か（手羽屋以外のお店のとき）。
   * ★立替の2つの棚には「どの店のものか」の欄がまだ無いので、
   *   よそのお店として読むと**手羽屋の立替が混ざります**。
   *   そこで画面側（lib/keiri/loadMonth.ts）と同じ決まりにして、手羽屋のときだけ読みます。
   *   「0件だった」と取り違えないように、飛ばしたことを必ず返します。
   */
  advancesSkipped: boolean;
};

/** YYYY-MM-DD を日数ぶんずらす */
export function shiftDate(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function loadKeiriMonthServer(params: {
  /** 見る月（YYYY-MM） */
  ym: string;
  /** 業態コード（手羽屋は "tebaya"） */
  businessCode: string;
  /**
   * 日報をその月だけ読むか（true）、数え始めの日からぜんぶ読むか（false）。
   * 事例ページはその月だけでよく、1枚の要約は現金の積み上げに過去も要る。
   */
  monthOnly?: boolean;
  /**
   * どのお店として読むか。既定は手羽屋（印が空）。
   * ★ここを渡さなかったときの結果は、これまでと1行も変わりません。
   */
  scope?: TenantScope;
  /**
   * 倉庫につなぐ物を差し替える口（テスト専用）。
   * 渡さなければ、いつもどおりサーバー側の読み取り用でつなぐ。
   */
  db?: unknown;
}): Promise<KeiriMonthServerData> {
  const { ym, businessCode } = params;
  const scope: TenantScope = params.scope ?? TEBAYA_SCOPE;
  const tebaya = isTebayaScope(scope);
  const monthStart = `${ym}-01`;
  const monthEndDate = shiftDate(shiftDate(monthStart, 32).slice(0, 7) + "-01", -1);

  const db = (params.db as ReturnType<typeof serverClient>) ?? serverClient();

  // 設定（数え始めの日・期首残高・外注費の率・家賃）
  const { data: s } = await db
    .from("keiri_settings")
    .select("opening_date, opening_balance, outsourcing_rate, monthly_rent, rent_start_month")
    .eq("business_type_code", businessCode)
    .maybeSingle();
  const settings: KeiriSettings = s
    ? {
        opening_date: (s as any).opening_date,
        opening_balance: Number((s as any).opening_balance) || 0,
        outsourcing_rate: Number((s as any).outsourcing_rate) || 0,
        monthly_rent: Number((s as any).monthly_rent) || 0,
        rent_start_month: (s as any).rent_start_month ?? "",
      }
    : defaultSettingsFor(businessCode);

  const opening = settings.opening_date || monthStart;
  const from = params.monthOnly ? monthStart : monthStart < opening ? monthStart : opening;

  // 日報（レシート写真の住所を抜いた軽い見え方）
  let reports: KeiriReport[] = [];
  let reportsUnreadable = false;
  {
    let q = applyTenantScope<any>(
      db
        .from("keiri_reports")
        .select("date, location, staff_name, shop, sales_amount, labor, expenses") as any,
      scope,
    ).gte("date", from);
    if (params.monthOnly) q = q.lte("date", monthEndDate);
    const { data, error } = await q.order("date");
    if (error) reportsUnreadable = true;
    else reports = (data as KeiriReport[]) ?? [];
  }

  // 支払い記録（まだ払っていないお金を出すのに要る）
  let payments: KeiriPayment[] = [];
  {
    const { data } = await db
      .from("keiri_payments")
      // ★id も取る。経理画面（サーバー側の窓口ごしに読むとき）が、
      //   払った記録を消すのにこの番号を使う。事例ページは使わないので影響しない。
      .select("id, paid_on, amount, kind, memo")
      .eq("business_type_code", businessCode)
      .order("paid_on", { ascending: false });
    payments = (data as KeiriPayment[]) ?? [];
  }

  // 立替。棚が2つあり列の名前も違うので形をそろえる。
  // 「月をまたいで同じ支払いが入っていないか」も見るので前後に40日の余白を取る。
  const advFrom = shiftDate(from, -40);
  const advTo = shiftDate(monthEndDate, 40);
  const advances: KeiriAdvance[] = [];
  let advancesUnreadable = false;
  // ★立替の2つの棚には「どの店のものか」の欄がまだ無い。
  //   よその店として読むと手羽屋の立替が混ざるので、手羽屋のときだけ読む
  //   （画面側 lib/keiri/loadMonth.ts と同じ決まり。CLAUDE.md 5-3）。
  const advancesSkipped = !tebaya;
  if (tebaya) {
    {
      const { data, error } = await db
        .from("keiri_advance_expenses")
        .select("expense_date, amount, payer, source_type, memo")
        .eq("business_type_code", businessCode)
        .gte("expense_date", advFrom)
        .lte("expense_date", advTo);
      if (error) advancesUnreadable = true;
      for (const row of (data as any[]) ?? []) advances.push(normalizeFieldAdvance(row));
    }
    {
      const { data, error } = await db
        .from("advance_expenses")
        .select("date, amount, payer, description, settled, settled_date")
        .gte("date", advFrom)
        .lte("date", advTo);
      if (error) advancesUnreadable = true;
      for (const row of (data as any[]) ?? []) advances.push(normalizeOwnerAdvance(row));
    }
  }

  // 金庫を数えた記録。棚がまだ無い倉庫でも落とさずに先へ進む。
  let cashEvents: CashEvent[] = [];
  let cashShelfMissing = false;
  {
    const { data, error } = await applyTenantScope<any>(
      db
        .from("keiri_cash_events")
        .select("kind, happened_on, amount, actor, note") as any,
      scope,
    )
      .gte("happened_on", from)
      .order("happened_on", { ascending: false });
    if (error) cashShelfMissing = true;
    else cashEvents = normalizeCashEvents((data as unknown[]) ?? []);
  }

  return {
    settings,
    settingsMissing: !s,
    reports,
    reportsUnreadable,
    payments,
    advances,
    advancesUnreadable,
    cashEvents,
    cashShelfMissing,
    advancesSkipped,
  };
}

/**
 * 渡された業態コードと「どのお店か」の印が食い違っていないか。
 * （手羽屋のコードでよそのお店として読む、のような取り違えを早く見つけるため）
 */
export function businessCodeMatchesScope(businessCode: string, scope: TenantScope): boolean {
  return businessCodeForScope(scope) === businessCode;
}
