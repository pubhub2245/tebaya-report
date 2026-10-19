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
  KEIRI_READ_BUDGET_MS,
  raceWithDeadline,
} from "@/lib/keiri/readBudget";
import { isMissingFunction } from "@/lib/keiri/tenantAccess";
import { TENANT_READ_WINDOW } from "@/lib/keiri/tenantReadGuard";
import {
  TENANT_CASH_EVENTS_WINDOW,
  TENANT_IGNORES_WINDOW,
  TENANT_PAYMENTS_WINDOW,
  TENANT_SETTINGS_WINDOW,
} from "@/lib/keiri/shelfScope";
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
  /**
   * 経理の設定（数え始めの日・期首残高）を**読めなかった**か（2026-10-19・f3-3・f3-4）。
   * ★「行が無い」（settingsMissing）と**区別します**。
   *   読めなかったのに既定値で計算すると、そのお店の現金残高が黙ってずれます。
   */
  settingsUnreadable: boolean;
  /** 払った記録（給与・外注費）を**読めなかった**か。**0円と取り違えない** */
  paymentsUnreadable: boolean;
  /** 金庫を数えた記録を**読めなかった**か。「まだ数えていない」と取り違えない */
  cashUnreadable: boolean;
  /** 「この支払いは数えない」の印を**読めなかった**か。「印が無い」と取り違えない */
  ignoresUnreadable: boolean;
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
  /**
   * 倉庫からの返事を**待つのをやめた**か（2026-10-16・kp255・f4-1・f5-1）。
   * ★true のときは、ここから下の数字はぜんぶ「読めませんでした」の形です。
   *   呼んだ側は今までどおり**手で確認した控え**に戻ります（数字は作りません）。
   */
  readTimedOut?: boolean;
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

/** 倉庫につなぐ物のうち、ここで使う所だけ */
type RpcLike = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: any }>;
};

/**
 * 棚ひとつぶんの「倉庫の窓口」に1回だけ聞く（f3-4・2026-10-18・kp253 ③）。
 * 読むだけ・書き込みはしない。
 *
 * ■ なぜ棚ごとに同じ形で聞けるようにしたか（やさしい説明）
 *   貼り紙⑧⑩⑪⑫は、**どの棚にも同じ形の窓口**を作ります
 *   （渡すのは「合言葉を戻せない形にしたもの」と期間だけ。どのお店かは倉庫が決める）。
 *   そこで、聞き方もここ1か所にそろえます。棚ごとに書き写すと、
 *   どれか1つだけ直し忘れて**よその店の数字が黙って0件になります**。
 *
 * ■ 返事の3通りを取り違えないこと（ここが肝です）
 *   ok … 窓口ごしに読めた（0件でも「本当に0件」）
 *   missing … 窓口がまだ無い＝**貼り紙を流す前**。今までどおり棚を直に読む
 *   error … 呼べたが失敗した。**0件と取り違えない**
 */
export async function readTenantShelfViaWindow(
  db: RpcLike,
  windowName: string,
  args: { passwordHash?: string; testMark?: string; from?: string | null; to?: string | null },
): Promise<{ outcome: "ok"; rows: Record<string, unknown>[] } | { outcome: "missing" } | { outcome: "error" }> {
  try {
    const { data, error } = await db.rpc(windowName, {
      p_password_hash: args.passwordHash ?? null,
      p_from: args.from ?? null,
      p_to: args.to ?? null,
      p_test_mark: args.testMark ?? null,
    });
    if (error) return isMissingFunction(error) ? { outcome: "missing" } : { outcome: "error" };
    if (!Array.isArray(data)) return { outcome: "error" };
    return { outcome: "ok", rows: data as Record<string, unknown>[] };
  } catch {
    return { outcome: "error" };
  }
}

/**
 * 棚を窓口ごしに聞いた結果（まだ聞いていない場合も含む）。
 *   ok       … 窓口が答えた
 *   missing  … 窓口そのものが倉庫に無い（＝貼り紙がまだ流れていない）
 *   error    … 窓口はあるかもしれないが、聞けなかった
 *   notasked … そもそも聞いていない（合言葉もテストの印も無かった）
 */
export type ShelfReadOutcome = "ok" | "missing" | "error" | "notasked";

/**
 * よその店の棚を、窓口で読めなかったときに **棚から直に読み直してよいか**
 * （2026-10-19・kp253 ③・f3-3・f3-4）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   貼り紙⑪⑫を流すと、経理の設定・払った記録・金庫の記録・「数えない」の印は
 *   「印が空の行だけ 読んでよい」になります。よその店の行をブラウザと同じ公開の鍵で
 *   そのまま聞くと、**エラーではなく「0件」**で返ってきます。
 *   0件をそのまま使うと、そのお店の画面には
 *     ・数え始めの日と期首残高 … 当てずっぽうの既定値
 *     ・給与・外注費（払った記録） … 0円
 *     ・金庫を数えた記録 … 無し
 *     ・「この支払いは数えない」の印 … 無し（同じ支払いを2回 数える）
 *   が **黙って** 出ます。＝ 現金残高と利益が、まちがったまま出ます。
 *
 * ■ ここで引く線
 *   窓口が「**まだ無い**」と答えたときだけ、棚は開いたままだと分かるので
 *   今までどおり直に読みます（貼り紙を流す前の倉庫＝いまの本番がこれ）。
 *   それ以外（聞けなかった・そもそも聞いていない）は、締まっているかもしれないので
 *   **読み直さずに「読めませんでした」と返します**（CLAUDE.md 5-3・lib/keiri/loadMonth.ts と同じ決まり）。
 *
 * ★手羽屋（印が空）はこの関数を通りません。手羽屋の読み方は1行も変わりません。
 */
export function tenantFallbackAllowed(outcome: ShelfReadOutcome): boolean {
  return outcome === "missing";
}

/** 窓口に1回だけ聞く。読むだけ・書き込みはしない */
export async function readTenantReportsViaWindow(
  db: RpcLike,
  args: { passwordHash?: string; testMark?: string; from: string; to?: string | null },
): Promise<TenantWindowResult> {
  const got = await readTenantShelfViaWindow(db, TENANT_READ_WINDOW, args);
  if (got.outcome !== "ok") return got;
  return { outcome: "ok", rows: got.rows as TenantWindowRow[] };
}

/** 月の数字を読む本体。**線（待つのをやめる）は下の loadKeiriMonthServer が引く** */
async function loadKeiriMonthServerInner(params: {
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
  /**
   * 倉庫からの返事を待つのをやめる線（ミリ秒・2026-10-16・kp255）。
   * 渡さなければ lib/keiri/readBudget.ts の既定（10秒）。0以下を渡すと線を引かない。
   */
  budgetMs?: number;
}): Promise<KeiriMonthServerData> {
  const { ym, businessCode } = params;
  const scope: TenantScope = params.scope ?? TEBAYA_SCOPE;
  const tebaya = isTebayaScope(scope);
  const monthStart = `${ym}-01`;
  const monthEndDate = shiftDate(shiftDate(monthStart, 32).slice(0, 7) + "-01", -1);

  const db = (params.db as ReturnType<typeof serverClient>) ?? serverClient();

  // よその店として読むときに、倉庫の窓口ごしに聞けるか（f3-4・2026-10-18・kp253 ③）。
  // ★手羽屋のときは false ＝ 読み方はこれまでと1行も変わりません。
  const viaWindow = !tebaya && Boolean(params.tenantReadHash || params.tenantReadTestMark);
  const windowArgs = {
    passwordHash: params.tenantReadHash,
    testMark: params.tenantReadTestMark,
  };

  // 設定（数え始めの日・期首残高・外注費の率・家賃）
  //
  // ■ なぜ窓口ごしに聞くようになったか（2026-10-18・kp253 ③）
  //   貼り紙⑫を流すと、この棚は「印が空の行だけ 読んでよい」になります。
  //   手羽屋（印が空）は今までどおりですが、**よその店の行は公開の鍵では読めません**。
  //   そのまま直に読むと、エラーではなく**0件**で返ってきます＝
  //   数え始めの日と期首残高が当てずっぽうになり、現金残高が黙ってずれます。
  //   ＝ よその店は、同じ貼り紙で作る**倉庫の窓口**ごしに読みます。
  //   窓口がまだ無い倉庫（貼り紙を流す前）では、今までどおりの読み方に落ちます。
  let s: any = null;
  let settingsViaWindow = false;
  let settingsOutcome: ShelfReadOutcome = "notasked";
  let settingsUnreadable = false;
  if (viaWindow) {
    const got = await readTenantShelfViaWindow(db as any, TENANT_SETTINGS_WINDOW, windowArgs);
    settingsOutcome = got.outcome;
    if (got.outcome === "ok") {
      settingsViaWindow = true;
      s = got.rows[0] ?? null;
    }
  }
  // ★よその店は、締まっているかもしれない棚を直に読み直さない（0件を「無い」と取り違えないため）
  if (!settingsViaWindow && !tebaya && !tenantFallbackAllowed(settingsOutcome)) {
    settingsUnreadable = true;
  } else if (!settingsViaWindow) {
    const { data } = await db
      .from("keiri_settings")
      .select(
        // ★memo も取る：置き場がまだ無いあいだ、金庫を数えた1回をここに控えている（f1-4）
        "opening_date, opening_balance, outsourcing_rate, monthly_rent, rent_start_month, memo",
      )
      .eq("business_type_code", businessCode)
      .maybeSingle();
    s = data ?? null;
  }
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
  // ★ここには**給与の金額**が入ります。よその店として読むときは窓口ごしに聞きます
  //   （貼り紙⑪のあと、直に読むと0件で返るため。kp253 ③）。
  let payments: KeiriPayment[] = [];
  let paymentsViaWindow = false;
  let paymentsOutcome: ShelfReadOutcome = "notasked";
  let paymentsUnreadable = false;
  if (viaWindow) {
    const got = await readTenantShelfViaWindow(db as any, TENANT_PAYMENTS_WINDOW, windowArgs);
    paymentsOutcome = got.outcome;
    if (got.outcome === "ok") {
      paymentsViaWindow = true;
      payments = (got.rows as unknown as KeiriPayment[]).slice().sort((a, b) => {
        const x = String((a as any).paid_on ?? "");
        const y = String((b as any).paid_on ?? "");
        return x === y ? 0 : x < y ? 1 : -1;
      });
    }
  }
  // ★よその店は、締まっているかもしれない棚を直に読み直さない（0件を「0円」と取り違えないため）
  if (!paymentsViaWindow && !tebaya && !tenantFallbackAllowed(paymentsOutcome)) {
    paymentsUnreadable = true;
  } else if (!paymentsViaWindow) {
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
  let cashUnreadable = false;
  {
    // ★よその店は窓口ごしに（貼り紙⑫のあと、直に読むと0件で返るため。kp253 ③）
    let cashViaWindow = false;
    let cashOutcome: ShelfReadOutcome = "notasked";
    if (viaWindow) {
      const got = await readTenantShelfViaWindow(db as any, TENANT_CASH_EVENTS_WINDOW, {
        ...windowArgs,
        from,
      });
      cashOutcome = got.outcome;
      if (got.outcome === "ok") {
        cashViaWindow = true;
        cashEvents = normalizeCashEvents(got.rows as unknown[]);
      }
    }
    // ★よその店は、締まっているかもしれない棚を直に読み直さない（0件を「数えていない」と取り違えないため）
    if (!cashViaWindow && !tebaya && !tenantFallbackAllowed(cashOutcome)) {
      cashUnreadable = true;
    } else if (!cashViaWindow) {
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
  let ignoresUnreadable = false;
  {
    // ★よその店は窓口ごしに（貼り紙⑫のあと、直に読むと0件で返るため。kp253 ③）
    //   ここを読み落とすと「数えない」と決めた支払いが また経費に戻ります。
    let ignoresViaWindow = false;
    let ignoresOutcome: ShelfReadOutcome = "notasked";
    if (viaWindow) {
      const got = await readTenantShelfViaWindow(db as any, TENANT_IGNORES_WINDOW, windowArgs);
      ignoresOutcome = got.outcome;
      if (got.outcome === "ok") {
        ignoresViaWindow = true;
        ignoreShelf = "ready";
        ignores = got.rows as unknown as ExpenseIgnoreRow[];
      }
    }
    // ★よその店は、締まっているかもしれない棚を直に読み直さない
    //   （印が0件になると、同じ支払いをまた2回 数えて経費が多く出ます）
    if (!ignoresViaWindow && !tebaya && !tenantFallbackAllowed(ignoresOutcome)) {
      ignoresUnreadable = true;
      ignoreShelf = "unknown";
    } else if (!ignoresViaWindow) {
      const { data, error } = await applyTenantScope<any>(
        db
          .from("keiri_expense_ignores")
          .select("id, source, ref_id, line_index, amount, paid_on, reason, undone_at") as any,
        scope,
      );
      ignoreShelf = ignoreShelfStateOf({ error });
      if (!error) ignores = (data as ExpenseIgnoreRow[]) ?? [];
    }
  }

  return {
    settings,
    settingsMissing: !s,
    settingsUnreadable,
    paymentsUnreadable,
    cashUnreadable,
    ignoresUnreadable,
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
 * 「読めませんでした」の形。**1円も作りません。**
 *
 * ★ここを「0件」「0円」と取り違えてはいけないので、読めなかった印を立てて返します
 *   （呼んだ側は、手で確認した控えに戻ります）。
 * ★金庫の棚は「まだ無い」にそろえます。確かめられていないものを「ある」とは言いません。
 */
function timedOutData(businessCode: string): KeiriMonthServerData {
  return {
    settings: defaultSettingsFor(businessCode),
    settingsMissing: true,
    settingsUnreadable: true,
    paymentsUnreadable: true,
    cashUnreadable: true,
    ignoresUnreadable: true,
    reports: [],
    reportsUnreadable: true,
    payments: [],
    advances: [],
    advancesUnreadable: true,
    advancesRepaidEarlier: [],
    cashEvents: [],
    cashShelfMissing: true,
    registerCloses: [],
    registerUnreadable: true,
    advancesSkipped: false,
    ignores: [],
    ignoreShelf: "unknown",
    readTimedOut: true,
  };
}

/**
 * 月の数字をサーバー側で読む（**読むだけ**）。
 *
 * ■ ここで引いている線（2026-10-16・kp255・f4-1・f5-1）
 *   倉庫が応えない日、本体は **63.2秒** 待ってから返っていました
 *   （倉庫をつなぐ部品が、1つの棚につき4回 試して 7.1秒。棚は9回ぶん）。
 *   その間 紹介ページ・お試し版・見本は白いままなので、**10秒で待つのをやめます**。
 *   やめたときは「読めませんでした」の形を返すので、呼んだ側は今までどおり
 *   **手で確認した控え**に戻ります（**数字は作りません**）。
 *   一瞬の不調で4回 試し直す仕組みはそのまま残してあるので（7.1秒＜10秒）、
 *   ふだんの日の答えは1行も変わりません。
 */
export async function loadKeiriMonthServer(
  params: Parameters<typeof loadKeiriMonthServerInner>[0],
): Promise<KeiriMonthServerData> {
  const budgetMs = params.budgetMs ?? KEIRI_READ_BUDGET_MS;
  const got = await raceWithDeadline(
    loadKeiriMonthServerInner(params),
    budgetMs,
    () => timedOutData(params.businessCode),
  );
  return got.value;
}

/**
 * 渡された業態コードと「どのお店か」の印が食い違っていないか。
 * （手羽屋のコードでよそのお店として読む、のような取り違えを早く見つけるため）
 */
export function businessCodeMatchesScope(businessCode: string, scope: TenantScope): boolean {
  return businessCodeForScope(scope) === businessCode;
}
