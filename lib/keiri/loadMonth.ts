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

import { supabase as browserSupabase } from "../supabase";
import { applyTenantScope, isTebayaScope, type TenantScope } from "../tenantScope";
import { readKeiriSecret } from "./browserSecret";
import {
  canFallbackToBrowserOnDenied,
  decideReadSource,
  readWindowOutcome,
} from "./readSource";
import { normalizeFieldAdvance, normalizeOwnerAdvance } from "./advances";
import { advanceReadRange, advanceRepaidEarlierRange } from "./advanceRange";
import {
  ignoreShelfStateOf,
  type ExpenseIgnoreRow,
  type IgnoreShelfState,
} from "./expenseIgnores";
import { normalizeCashEvents, type CashEvent } from "./cashCheck";
import { decodeCashCountMemo, mergeCashEvents } from "./cashCountMemo";
import { normalizeRegisterCloses, type RegisterCloseRow } from "./registerFloat";
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
   * 「前の月までに立て替えて、この期間に返した立替」（2026-10-12・kp250・f1-4）。
   * ★**月の経費・利益・会計ソフト向けCSVには1円も入れません。**
   *   金庫を数えたときに「もう1通りの数え方」を出すためだけに使います
   *   （lib/keiri/cashVariant.ts）。理由は lib/keiri/advanceRange.ts に書いてあります。
   */
  advancesRepaidEarlier: KeiriAdvance[];
  /**
   * 金庫を数えた記録と、銀行に入れた記録（kp233・f1-4）。
   * ★棚（keiri_cash_events）がまだ無い倉庫でも落ちないように、
   *   読めなければ**空のまま**にする（＝画面は今までどおり何も出さない）。
   */
  cashEvents: CashEvent[];
  /** 棚がまだ無い（＝貼り紙を流していない）か */
  cashShelfMissing: boolean;
  /**
   * 閉店後に**レジに残してあるつり銭**の実測（2026-10-12・f1-4）。
   * ★月の経費・利益・会計ソフト向けCSVには1円も入れません。
   *   金庫を数えたときに「金庫だけを数えた場合の相手」を並べるためだけに使います
   *   （lib/keiri/registerFloat.ts）。読めなければ空のまま＝今までどおり。
   */
  registerCloses: RegisterCloseRow[];
  /**
   * 「同じ支払いが2か所にある」ときの印（kp230・f1-5）。
   * ★棚（keiri_expense_ignores）がまだ無い倉庫では空のまま＝今までどおり「出すだけ」。
   */
  ignores: ExpenseIgnoreRow[];
  /** 印を置く棚がまだ無いか（まだ無いときは選ぶボタンを出さない） */
  ignoreShelf: IgnoreShelfState;
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
 *   ただし **「合言葉が合わない」だけは戻しません**（2026-10-07・kp239）。
 *   戻すと、合っていない人に、その番号のお店の帳簿を出してしまうためです。
 *
 * ■ 2026-10-11 から、手羽屋もここを通ります（kp239・f3-4）
 *   それまでは手羽屋だけブラウザ直読みでした。残しておくと、経理の画面に
 *   「ブラウザが名乗った番号で帳簿を開く道」が1本 残り続けます。
 */
async function loadViaServerWindow(params: {
  ym: string;
  scope: TenantScope;
  fallbackSettings: KeiriSettings;
}): Promise<KeiriMonthData | null> {
  const passwordHash = readKeiriSecret();
  // 札がこのタブに無い＝窓口には聞けない。今までどおりの読み方に戻す
  if (!passwordHash) return null;

  // 窓口に聞く。**通信そのものの失敗と、断られたのとを分けて扱う**のが肝。
  let status = 0;
  let json: any = null;
  try {
    const res = await fetch("/api/keiri/month", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ym: params.ym, passwordHash }),
    });
    status = res.status;
    json = await res.json().catch(() => null);
  } catch {
    // 電波が無い・窓口まで届かない。今までどおりの読み方に戻す
    return null;
  }

  const outcome = readWindowOutcome(status, json);
  // ★「合言葉が合わない」ときは、ブラウザ直読みに落としません。
  //   落とすと、合っていない人に、その番号のお店の帳簿を出してしまいます。
  if (outcome.kind === "denied") {
    // ★手羽屋だけは、ここで今までどおりの読み方に戻します（2026-10-11・kp239）。
    //   手羽屋の帳簿は「戻った先」そのものなので、戻しても よその店の数字は1円も出ません。
    //   逆に戻さないと、合言葉の形が少しちがうだけで じゅんの経理画面が開かなくなります。
    if (canFallbackToBrowserOnDenied(params.scope)) return null;
    throw new Error(
      "この画面を開く合言葉が合いませんでした。いったん「ログアウト」して、入り直してください。",
    );
  }
  if (outcome.kind !== "ok") return null;

  const d = json.data ?? {};
  // ★読めなかった棚を「0件」と取り違えない（経費が落ちて利益が多く出るのを防ぐ）
  if (d.reportsUnreadable) {
    throw new Error("日報を読めませんでした。少し待ってから開き直してください。");
  }
  if (d.advancesUnreadable) {
    throw new Error("立替の記録を読めませんでした。少し待ってから開き直してください。");
  }
  // ★日報・立替いがいの棚（数え始めと期首残高・給与・金庫の記録・「数えない」の印）も同じ決まりで止めます
  //   （2026-10-19・f3-3・f3-4）。読めなかったのに既定値や0件で計算すると、
  //   そのお店の**現金残高と利益がまちがったまま**画面に出ます。
  if (d.settingsUnreadable || d.paymentsUnreadable || d.cashUnreadable || d.ignoresUnreadable) {
    throw new Error(
      "帳簿の一部（数え始めの日・給与・金庫の記録・「数えない」の印）を読めませんでした。" +
        "まちがった金額を出さないために、ここでは何も出しません。少し待ってから開き直してください。",
    );
  }

  return {
    settings: d.settingsMissing ? params.fallbackSettings : (d.settings as KeiriSettings),
    settingsMissing: !!d.settingsMissing,
    reports: (d.reports as KeiriReport[]) ?? [],
    payments: (d.payments as (KeiriPayment & { id: number })[]) ?? [],
    advances: (d.advances as KeiriAdvance[]) ?? [],
    // ★窓口がまだこの欄を返さない版でも落ちないように、無ければ空のまま（＝今までどおり）
    advancesRepaidEarlier: (d.advancesRepaidEarlier as KeiriAdvance[]) ?? [],
    cashEvents: (d.cashEvents as CashEvent[]) ?? [],
    cashShelfMissing: !!d.cashShelfMissing,
    // ★窓口がまだこの欄を返さない版でも落ちないように、無ければ空のまま（＝今までどおり）
    registerCloses: (d.registerCloses as RegisterCloseRow[]) ?? [],
    ignores: (d.ignores as ExpenseIgnoreRow[]) ?? [],
    ignoreShelf: (d.ignoreShelf as IgnoreShelfState) ?? "unknown",
  };
}

export type KeiriMonthParams = {
  /** 見ている月（YYYY-MM） */
  ym: string;
  /** いまどのお店として開いているか（null＝手羽屋） */
  scope: TenantScope;
  /** 業態コード（手羽屋は "tebaya"） */
  businessCode: string;
  /** 設定の行が無いときに使う値 */
  fallbackSettings: KeiriSettings;
};

export async function loadKeiriMonth(params: KeiriMonthParams): Promise<KeiriMonthData> {
  const { ym, scope, fallbackSettings } = params;

  // ★どこから読むかは lib/keiri/readSource.ts の1か所で決める（kp239・f3-4）。
  //   2026-10-11 から **手羽屋もここを通ります**（それまでは手羽屋だけブラウザ直読み）。
  //   窓口はお店の番号を受け取らず、合言葉からサーバーが決めるので、
  //   ブラウザが名乗った番号で帳簿が開く道が、経理の画面から無くなります。
  //   札が無い・窓口が無い・通信できない ときだけ、今までどおりの読み方に落ちます。
  if (decideReadSource(scope) === "server") {
    const viaServer = await loadViaServerWindow({ ym, scope, fallbackSettings });
    if (viaServer) return viaServer;
  }

  // ★よその店は、ここで**今までどおりの読み方（棚を直に読む）に戻しません**
  //   （2026-10-18・kp253 ③・f3-4）。
  //
  // ■ なぜ戻さないか（やさしい説明）
  //   貼り紙⑪⑫を流すと、経理の設定・払った記録・金庫の記録・「数えない」の印は
  //   「印が空の行だけ 読んでよい」になります。ブラウザの鍵でそのまま聞くと、
  //   よその店の行は**エラーではなく「0件」**で返ってきます。
  //   ＝ 数え始めの日・期首残高・給与・金庫の記録が黙って消え、
  //      **現金残高と利益が、まちがったまま画面に出ます**。
  //   「読めなかった」を「0円・0件」と取り違えないのが、この経理の土台の決まりです
  //   （CLAUDE.md 5-3・lib/keiri/loadMonthServer.ts と同じ考え方）。
  //   ブラウザには合言葉をサーバーのように持たせられないので、
  //   窓口ごしに読めなかったときは**数字を出さずに正直に止まります**。
  //
  // ■ 手羽屋は1行も変わりません
  //   手羽屋（印が空）は、これまでどおり下の「棚を直に読む道」に戻ります。
  //   戻った先が手羽屋の帳簿そのものなので、よその店の数字は1円も出ません。
  if (!isTebayaScope(scope)) {
    throw new Error(
      "いまは帳簿を読めませんでした（通信か、サーバー側の窓口の不調）。" +
        "数字を作らないために、ここでは何も出しません。少し待ってから開き直してください。",
    );
  }

  return loadKeiriMonthDirect(params);
}

/**
 * ブラウザ（または、同じ鍵を使うサーバー）から倉庫を直接のぞいて読む、今までの道。
 *
 * ■ なぜ外から呼べる形にしたか（2026-10-11・kp239）
 *   手羽屋も窓口から読むように変えたので、**2つの道が同じ数字を出すか**を
 *   外から1回で確かめられる必要があります（/api/keiri/readpaths）。
 *   そのために「読む相手（倉庫の鍵）」を差し替えられる形にしました。
 *   差し替えないときは、今までとまったく同じブラウザの鍵で読みます。
 */
export async function loadKeiriMonthDirect(
  params: KeiriMonthParams & { db?: typeof browserSupabase },
): Promise<KeiriMonthData> {
  const { ym, scope, businessCode, fallbackSettings } = params;
  // 差し替えが無ければ、今までどおりブラウザの鍵で読む
  const supabase = params.db ?? browserSupabase;

  // 設定（数え始めの日・期首残高・Alphaの率・家賃）
  const { data: s, error: sErr } = await supabase
    .from("keiri_settings")
    .select(
      // ★memo も取る：置き場（keiri_cash_events）がまだ無いあいだ、
      //   金庫を数えた1回をここに控えているため（lib/keiri/cashCountMemo.ts・f1-4）
      "opening_date, opening_balance, outsourcing_rate, monthly_rent, rent_start_month, memo",
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
    // ★id を取るのは「同じ支払いが2か所にある」ときの印を、どの行に付けたか分かるようにするため（kp230）
    .select("id, date, location, staff_name, shop, sales_amount, labor, expenses");
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
  const advancesRepaidEarlier: KeiriAdvance[] = [];
  if (isTebayaScope(scope)) {
    // ★読む期間は lib/keiri/advanceRange.ts の1か所で決める（2026-10-11・kp249）。
    //   サーバー側の窓口（loadMonthServer.ts）と同じ関数を呼ぶので、もうずれません。
    //   いまの決まりでは from は下の gte と同じ日・上は区切らない＝画面は1日も変わりません。
    const advRange = advanceReadRange({ ym, openingDate: from });
    const fieldQuery = supabase
      .from("keiri_advance_expenses")
      .select("id, expense_date, amount, payer, source_type, memo")
      .eq("business_type_code", businessCode)
      .gte("expense_date", advRange.from);
    const { data: field } = await (advRange.to
      ? fieldQuery.lte("expense_date", advRange.to)
      : fieldQuery);
    for (const row of (field as any[]) ?? []) {
      advances.push(normalizeFieldAdvance(row));
    }
    const ownerQuery = supabase
      .from("advance_expenses")
      .select("id, date, amount, payer, description, settled, settled_date")
      .gte("date", advRange.from);
    const { data: owner } = await (advRange.to
      ? ownerQuery.lte("date", advRange.to)
      : ownerQuery);
    for (const row of (owner as any[]) ?? []) {
      advances.push(normalizeOwnerAdvance(row));
    }
    // 「前の月までに立て替えて、この期間に返した立替」を**別の入れ物**で読む（kp250・f1-4）。
    // ★読めなくても落とさない・上の advances には1行も混ぜない
    //   （混ぜると月の経費と会計ソフト向けCSVが黙って動きます）。
    try {
      const repaidRange = advanceRepaidEarlierRange(advRange);
      const repaidQuery = supabase
        .from("advance_expenses")
        .select("id, date, amount, payer, description, settled, settled_date")
        .lt("date", repaidRange.advancedBefore)
        .eq("settled", true)
        .gte("settled_date", repaidRange.repaidFrom);
      const { data: repaidRows } = await (repaidRange.repaidTo
        ? repaidQuery.lte("settled_date", repaidRange.repaidTo)
        : repaidQuery);
      for (const row of (repaidRows as any[]) ?? []) {
        advancesRepaidEarlier.push(normalizeOwnerAdvance(row));
      }
    } catch {
      // ★ここで落とさない。読めなければ「もう1通りの数え方」を出さないだけで、
      //   今までの数字（経費・利益・CSV・画面）は1円も変わりません。
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
    // ★置き場がまだ無いあいだ、経理の設定のおまけ欄に控えた「数えた1回」も読む（f1-4）。
    //   置き場ができたあとも読み、同じ日・同じ金額は1件として数える（二重に数えない）。
    cashEvents = mergeCashEvents(cashEvents, decodeCashCountMemo((s as any)?.memo));
  }

  // 閉店後にレジに残したつり銭（日報の実測）。**金庫の外にあるお金**なので、
  // 金庫を数えた金額と比べるときの相手に使う（f1-4）。
  // ★読めなくても落とさない。読めなければ相手が増えないだけで、今までの数字は1円も動かない。
  // ★経費の明細は取らない（3つの欄だけ＝CLAUDE.md 4-2 を守る）。
  let registerCloses: RegisterCloseRow[] = [];
  try {
    const regQuery = supabase
      .from("daily_reports")
      .select("date, unit_number, register_total");
    const { data: regs, error: regErr } = await applyTenantScope<any>(regQuery as any, scope)
      .gte("date", gte)
      .order("date");
    if (!regErr) registerCloses = normalizeRegisterCloses((regs as unknown[]) ?? []);
  } catch {
    // 読めなければ空のまま
  }

  // 「同じ支払いが2か所にある」ときの印（kp230）。
  // ★棚がまだ無い倉庫では、落とさずに「まだ無い」とだけ覚えて先へ進む（金庫の記録と同じ形）。
  let ignores: ExpenseIgnoreRow[] = [];
  let ignoreShelf: IgnoreShelfState = "unknown";
  {
    const ignoreQuery = supabase
      .from("keiri_expense_ignores")
      .select("id, source, ref_id, line_index, amount, paid_on, reason, undone_at");
    const { data: rows, error: iErr } = await applyTenantScope<any>(ignoreQuery as any, scope);
    ignoreShelf = ignoreShelfStateOf({ error: iErr });
    if (!iErr) ignores = ((rows as ExpenseIgnoreRow[]) ?? []);
  }

  return {
    settings,
    settingsMissing: !s,
    reports: (reps as KeiriReport[]) ?? [],
    payments: (pays as (KeiriPayment & { id: number })[]) ?? [],
    advances,
    advancesRepaidEarlier,
    cashEvents,
    cashShelfMissing,
    registerCloses,
    ignores,
    ignoreShelf,
  };
}
