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
import { isMissingFunction } from "@/lib/keiri/tenantAccess";
import { TENANT_READ_WINDOW } from "@/lib/keiri/tenantReadGuard";
import {
  applyTenantScope,
  businessCodeForScope,
  isTebayaScope,
  TEBAYA_SCOPE,
  type TenantScope,
} from "@/lib/tenantScope";
import { normalizeFieldAdvance, normalizeOwnerAdvance } from "@/lib/keiri/advances";
import { advanceReadRange, advanceRepaidEarlierRange } from "@/lib/keiri/advanceRange";
import {
  ignoreShelfStateOf,
  type ExpenseIgnoreRow,
  type IgnoreShelfState,
} from "@/lib/keiri/expenseIgnores";
import { normalizeCashEvents, type CashEvent } from "@/lib/keiri/cashCheck";
import { decodeCashCountMemo, mergeCashEvents } from "@/lib/keiri/cashCountMemo";
import {
  normalizeRegisterCloses,
  type RegisterCloseRow,
} from "@/lib/keiri/registerFloat";
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
  /**
   * 「前の月までに立て替えて、この期間に返した立替」（2026-10-12・kp250・f1-4）。
   * ★**月の経費・利益・会計ソフト向けCSVには1円も入れません。**
   *   金庫を数えたときに「もう1通りの数え方」を出すためだけに使います
   *   （lib/keiri/cashVariant.ts）。理由は lib/keiri/advanceRange.ts に書いてあります。
   */
  advancesRepaidEarlier: KeiriAdvance[];
  cashEvents: CashEvent[];
  /** 金庫の記録の棚がまだ無いか（貼り紙を流していない） */
  cashShelfMissing: boolean;
  /**
   * 閉店後に**レジに残してあるつり銭**の実測（2026-10-12・f1-4）。
   * ★月の経費・利益・会計ソフト向けCSVには1円も入れません。
   *   金庫を数えたときに「金庫だけを数えた場合の相手」を並べるためだけに使います。
   */
  registerCloses: RegisterCloseRow[];
  /** 閉店後のレジ金を読めなかったか（**0円と取り違えない**ため） */
  registerUnreadable: boolean;
  /**
   * 立替の棚を**読まずに飛ばした**か（手羽屋以外のお店のとき）。
   * ★立替の2つの棚には「どの店のものか」の欄がまだ無いので、
   *   よそのお店として読むと**手羽屋の立替が混ざります**。
   *   そこで画面側（lib/keiri/loadMonth.ts）と同じ決まりにして、手羽屋のときだけ読みます。
   *   「0件だった」と取り違えないように、飛ばしたことを必ず返します。
   */
  advancesSkipped: boolean;
  /**
   * 「同じ支払いが2か所にある」ときに、どちらを数えるかを決めた印（kp230・f1-5）。
   * ★棚（keiri_expense_ignores）がまだ無い倉庫では空のまま＝今までと同じ数字になります。
   */
  ignores: ExpenseIgnoreRow[];
  /** 印を置く棚の様子（ready／missing／unknown） */
  ignoreShelf: IgnoreShelfState;
};

/** YYYY-MM-DD を日数ぶんずらす */
export function shiftDate(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * よその店の日報を、**倉庫の窓口ごし**に読む（f3-4・2026-10-15・kp251）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   貼り紙⑧を流すと、日報の棚は「**印が空の行だけ 読んでよい**」になります。
 *   手羽屋（印が空）は今までどおりですが、**よその店の行は公開の鍵では読めません**。
 *   いまサーバー側の鍵は壊れているので（kp241）、ここも公開の鍵で読んでいます。
 *   ＝ よその店は、同じ⑧で作る**倉庫の窓口**ごしに読む必要があります。
 *
 * ■ 窓口は「お店の番号」を受け取りません
 *   渡すのは**合言葉を戻せない形にしたもの**だけで、どのお店かは倉庫が決めます
 *   （kp239 ② と同じ決まり）。番号を書き換えても、よその店の帳簿は開きません。
 *
 * ■ 窓口がまだ無い倉庫では、今までどおりに戻ります
 *   貼り紙を流す前は窓口がありません。そのときは**今までの読み方**に落とすので、
 *   流す前と流したあとで、同じコードがどちらでも動きます。
 */
export type TenantWindowRow = {
  id?: unknown;
  date?: unknown;
  location?: unknown;
  staff_name?: unknown;
  shop?: unknown;
  sales_amount?: unknown;
  labor?: unknown;
  expenses?: unknown;
  unit_number?: unknown;
  register_total?: unknown;
};

export type TenantWindowResult =
  /** 窓口ごしに読めた */
  | { outcome: "ok"; rows: TenantWindowRow[] }
  /** 窓口がまだ無い＝今までどおりの読み方に戻す */
  | { outcome: "missing" }
  /** 呼べたが失敗した。**0件と取り違えない** */
  | { outcome: "error" };

/** 窓口に1回だけ聞く。読むだけ・書き込みはしない */
export async function readTenantReportsViaWindow(
  db: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: any }> },
  args: { passwordHash?: string; testMark?: string; from: string; to?: string | null },
): Promise<TenantWindowResult> {
  try {
    const { data, error } = await db.rpc(TENANT_READ_WINDOW, {
      p_password_hash: args.passwordHash ?? null,
      p_from: args.from,
      p_to: args.to ?? null,
      p_test_mark: args.testMark ?? null,
    });
    if (error) return isMissingFunction(error) ? { outcome: "missing" } : { outcome: "error" };
    if (!Array.isArray(data)) return { outcome: "error" };
    return { outcome: "ok", rows: data as TenantWindowRow[] };
  } catch {
    return { outcome: "error" };
  }
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
   * よその店として読むときに、倉庫の窓口へ渡す「合言葉を戻せない形にしたもの」。
   * ★渡さなければ今までどおり棚を直に読みます（手羽屋の読み方は何も変わりません）。
   */
  tenantReadHash?: string;
  /**
   * テストの店として読むときの印（test- で始まるもの）。
   * 2軒目を入れる手順を、こちら側だけで通すための道です（f5-4）。
   */
  tenantReadTestMark?: string;
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
    .select(
      // ★memo も取る：置き場がまだ無いあいだ、金庫を数えた1回をここに控えている（f1-4）
      "opening_date, opening_balance, outsourcing_rate, monthly_rent, rent_start_month, memo",
    )
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

  // よその店の行は、貼り紙⑧のあと**公開の鍵では読めません**（f3-4・kp251）。
  // そのときは倉庫の窓口ごしに1回 読んで、日報とレジ金の両方をここから作ります。
  // ★窓口がまだ無い倉庫・合言葉を渡されなかったときは null のままで、
  //   下の「今までどおりの読み方」がそのまま動きます（流す前と同じ結果）。
  let windowRows: TenantWindowRow[] | null = null;
  if (!tebaya && (params.tenantReadHash || params.tenantReadTestMark)) {
    const got = await readTenantReportsViaWindow(db as any, {
      passwordHash: params.tenantReadHash,
      testMark: params.tenantReadTestMark,
      from,
      to: null,
    });
    if (got.outcome === "ok") windowRows = got.rows;
  }

  // 日報（レシート写真の住所を抜いた軽い見え方）
  let reports: KeiriReport[] = [];
  let reportsUnreadable = false;
  if (windowRows) {
    reports = windowRows
      .filter((r) => {
        const d = String(r.date ?? "");
        return !params.monthOnly || (d >= monthStart && d <= monthEndDate);
      })
      .map((r) => ({
        id: r.id as any,
        date: String(r.date ?? ""),
        location: (r.location ?? null) as any,
        staff_name: (r.staff_name ?? null) as any,
        shop: (r.shop ?? null) as any,
        sales_amount: (r.sales_amount ?? 0) as any,
        labor: (r.labor ?? 0) as any,
        expenses: (r.expenses ?? []) as any,
      })) as KeiriReport[];
  } else {
    let q = applyTenantScope<any>(
      db
        .from("keiri_reports")
        // ★id も取る（「同じ支払いが2か所にある」ときの印を、どの行に付けたか分かるように・kp230）
        .select("id, date, location, staff_name, shop, sales_amount, labor, expenses") as any,
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
  // ★読む期間は lib/keiri/advanceRange.ts の1か所で決める（2026-10-11・kp249）。
  //   ここに期間を書いていたため、画面側（loadMonth.ts）と17件ずれていた。
  const advRange = advanceReadRange({
    ym,
    openingDate: settings.opening_date || monthStart,
    monthOnly: params.monthOnly,
  });
  const advances: KeiriAdvance[] = [];
  const advancesRepaidEarlier: KeiriAdvance[] = [];
  let advancesUnreadable = false;
  // ★立替の2つの棚には「どの店のものか」の欄がまだ無い。
  //   よその店として読むと手羽屋の立替が混ざるので、手羽屋のときだけ読む
  //   （画面側 lib/keiri/loadMonth.ts と同じ決まり。CLAUDE.md 5-3）。
  const advancesSkipped = !tebaya;
  if (tebaya) {
    {
      const fieldQuery = db
        .from("keiri_advance_expenses")
        .select("id, expense_date, amount, payer, source_type, memo")
        .eq("business_type_code", businessCode)
        .gte("expense_date", advRange.from);
      const { data, error } = await (advRange.to
        ? fieldQuery.lte("expense_date", advRange.to)
        : fieldQuery);
      if (error) advancesUnreadable = true;
      for (const row of (data as any[]) ?? []) advances.push(normalizeFieldAdvance(row));
    }
    {
      const ownerQuery = db
        .from("advance_expenses")
        .select("id, date, amount, payer, description, settled, settled_date")
        .gte("date", advRange.from);
      const { data, error } = await (advRange.to
        ? ownerQuery.lte("date", advRange.to)
        : ownerQuery);
      if (error) advancesUnreadable = true;
      for (const row of (data as any[]) ?? []) advances.push(normalizeOwnerAdvance(row));
    }
    // 「前の月までに立て替えて、この期間に返した立替」を**別の入れ物**で読む（kp250・f1-4）。
    // ★読めなくても落とさない・上の advances には1行も混ぜない
    //   （混ぜると月の経費と会計ソフト向けCSVが黙って動きます）。
    try {
      const repaid = advanceRepaidEarlierRange(advRange);
      const q = db
        .from("advance_expenses")
        .select("id, date, amount, payer, description, settled, settled_date")
        .lt("date", repaid.advancedBefore)
        .eq("settled", true)
        .gte("settled_date", repaid.repaidFrom);
      const { data, error } = await (repaid.repaidTo
        ? q.lte("settled_date", repaid.repaidTo)
        : q);
      if (!error) {
        for (const row of (data as any[]) ?? []) {
          advancesRepaidEarlier.push(normalizeOwnerAdvance(row));
        }
      }
    } catch {
      // ★ここで落とさない。読めなければ「もう1通りの数え方」を出さないだけで、
      //   今までの数字（経費・利益・CSV・画面）は1円も変わりません。
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
    // ★置き場がまだ無いあいだ、経理の設定のおまけ欄に控えた「数えた1回」も読む（f1-4）。
    //   画面（/keiri）はこの窓口から読むので、ここを通さないと控えが画面に出ない。
    cashEvents = mergeCashEvents(cashEvents, decodeCashCountMemo((s as any)?.memo));
  }

  // 閉店後にレジに残したつり銭（日報の実測）。**金庫の外にあるお金**なので、
  // 金庫を数えた金額と比べるときの相手に使う（f1-4）。
  // ★読めなくても落とさない。経費の明細は取らない（3つの欄だけ＝CLAUDE.md 4-2）。
  let registerCloses: RegisterCloseRow[] = [];
  let registerUnreadable = false;
  if (windowRows) {
    // 窓口が同じ1回で返してくれているので、もう一度 倉庫に聞かない
    registerCloses = normalizeRegisterCloses(windowRows as unknown[]);
  } else {
    const { data, error } = await applyTenantScope<any>(
      db.from("daily_reports").select("date, unit_number, register_total") as any,
      scope,
    )
      .gte("date", from)
      .order("date");
    if (error) registerUnreadable = true;
    else registerCloses = normalizeRegisterCloses((data as unknown[]) ?? []);
  }

  // 「同じ支払いが2か所にある」ときの印（kp230）。棚がまだ無い倉庫でも落とさずに先へ進む。
  let ignores: ExpenseIgnoreRow[] = [];
  let ignoreShelf: IgnoreShelfState = "unknown";
  {
    const { data, error } = await applyTenantScope<any>(
      db
        .from("keiri_expense_ignores")
        .select("id, source, ref_id, line_index, amount, paid_on, reason, undone_at") as any,
      scope,
    );
    ignoreShelf = ignoreShelfStateOf({ error });
    if (!error) ignores = (data as ExpenseIgnoreRow[]) ?? [];
  }

  return {
    settings,
    settingsMissing: !s,
    reports,
    reportsUnreadable,
    payments,
    advances,
    advancesUnreadable,
    advancesRepaidEarlier,
    cashEvents,
    cashShelfMissing,
    registerCloses,
    registerUnreadable,
    advancesSkipped,
    ignores,
    ignoreShelf,
  };
}

/**
 * 渡された業態コードと「どのお店か」の印が食い違っていないか。
 * （手羽屋のコードでよそのお店として読む、のような取り違えを早く見つけるため）
 */
export function businessCodeMatchesScope(businessCode: string, scope: TenantScope): boolean {
  return businessCodeForScope(scope) === businessCode;
}
