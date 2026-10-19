import { NextResponse } from "next/server";

import { calcCashPosition } from "@/lib/keiri/aggregate";
import { depositsOf, latestCount, reconcileCash } from "@/lib/keiri/cashCheck";
import {
  buildCashCountReady,
  buildCashCountWindow,
  type CashCountPlace,
} from "@/lib/keiri/cashCountWindow";
import { buildCashOpeningSource } from "@/lib/keiri/cashOpeningSource";
import { buildCashVariants, pickCashVariant } from "@/lib/keiri/cashVariant";
import { CASE_BUSINESS_CODE } from "@/lib/keiri/caseStats";
import { CHECK_WINDOW_HEADERS, stampCheckWindow } from "@/lib/keiri/checkWindow";
import { defaultSettingsFor } from "@/lib/keiri/index";
import { loadKeiriMonthServer } from "@/lib/keiri/loadMonthServer";
import { latestRegisterFloat } from "@/lib/keiri/registerFloat";
import { serverClient } from "@/lib/supabaseServer";
import { TEBAYA_SCOPE } from "@/lib/tenantScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/keiri/cashcount
 *
 * 「金庫を数えた結果が、計算上の現金と合っていたか」を外から1回で確かめる窓口（f1-4）。
 *
 * ■ なぜ要るのか（やさしい説明）
 *   じゅんが金庫を数えて金額を入れると、画面には合否が出ます。ところが
 *   じゅんの経理の画面は合言葉の内側で、こちら（Claude）からは開けません。
 *   ＝ 入れてもらっても「合っていたか」をこちら側で確かめられず、
 *   仕上げチェック表の f1-4 に合否を付けられませんでした。
 *   この窓口は、その1点だけを答えます。
 *
 * ■ 返さないもの（ここが大事）
 *   **金額は1円も返しません**（計算上の現金・数えた金額・差のどれも）。
 *   返すのは「合っていたか」「差が1,000円より小さいか」「どの数え方に合ったか」
 *   「数えた日」だけです。合言葉・鍵・お店の名前は1文字も返しません。
 *
 * ■ 1行も書き込みません。手羽屋が毎日使う画面（日報・シフト・レジ・LINE）にも触れません。
 */
export async function GET() {
  const today = new Date();
  const todayJst = todayStr(today);
  const ym = todayJst.slice(0, 7);

  try {
    const db = serverClient();
    // 手羽屋ぶんを、画面と同じ読み方（サーバー側の窓口が使う道）で読む
    const data = await loadKeiriMonthServer({
      ym,
      businessCode: CASE_BUSINESS_CODE,
      scope: TEBAYA_SCOPE,
      monthOnly: false,
      db,
    });
    if (data.reportsUnreadable) {
      return json({ ok: false, reason: "日報を読めませんでした（0件と取り違えないこと）" });
    }

    const settings = data.settingsMissing
      ? defaultSettingsFor(CASE_BUSINESS_CODE)
      : data.settings;
    const deposits = depositsOf(data.cashEvents);
    const last = latestCount(data.cashEvents);

    const balanceAt = (date: string, withRepaid: boolean): number =>
      calcCashPosition({
        reports: data.reports,
        payments: data.payments,
        settings,
        advances: withRepaid
          ? [...data.advances, ...(data.advancesRepaidEarlier ?? [])]
          : data.advances,
        deposits,
        asOf: date,
      }).balance;

    const computedAtCount = last ? balanceAt(last.happened_on, false) : null;
    const reconcile = reconcileCash({
      events: data.cashEvents,
      computedAtCount,
      today: todayJst,
    });

    const repaidRows = data.advancesRepaidEarlier ?? [];

    // 数え方が2通りに分かれている月だけ、どちらに合ったかも出す（kp250）
    let pick: ReturnType<typeof pickCashVariant> | null = null;
    if (last) {
      const variants = buildCashVariants({
        screenBalance: computedAtCount,
        withRepaidBalance: repaidRows.length > 0 ? balanceAt(last.happened_on, true) : null,
        registerFloat: latestRegisterFloat(data.registerCloses ?? [], last.happened_on).total,
      });
      const p = pickCashVariant({ variants, counted: last.amount });
      pick = p.hasChoice ? p : null;
    }

    // ★数える前でも「いま数えてもらえば合否が出るか」を答える（2026-10-16・kp245）。
    //   金額は1円も出さない（相手の名前と数だけ）。
    const floatToday = latestRegisterFloat(data.registerCloses ?? [], todayJst);
    const ready = buildCashCountReady({
      variants: buildCashVariants({
        screenBalance: data.settingsMissing ? null : balanceAt(todayJst, false),
        withRepaidBalance:
          !data.settingsMissing && repaidRows.length > 0 ? balanceAt(todayJst, true) : null,
        registerFloat: floatToday.total,
      }),
      registerFloatOn: floatToday.latestOn,
    });

    // 記録がどこにあるか（置き場／おまけ欄の控え）。金額は見ません
    const place: CashCountPlace | null = last ? (data.cashShelfMissing ? "控え" : "棚") : null;

    // ★「どの数え始めと比べているのか」を外にも出す（2026-10-19・f1-4）。
    //   数え始めの記録は倉庫に2か所あり（経理＝keiri_settings／手羽屋の毎日の画面＝cash_settings）、
    //   どちらを読むかで「今の現金」が丸ごと変わります。経理が読むのは keiri_settings だけ
    //   という事実を、外から1回で読める形にしておきます。**金額は1円も出しません**（日付と棚の名前だけ）。
    const openingSource = buildCashOpeningSource({
      openingDate: data.settingsMissing ? null : (settings.opening_date ?? null),
      ...(await readDailyScreenOpening(db)),
    });

    return json({
      ok: true,
      ...buildCashCountWindow({ reconcile, pick, place }),
      shelfMissing: data.cashShelfMissing,
      // 数え方が2通りに分かれている月か（件数だけ・金額は返さない）
      variantRows: repaidRows.length,
      // 数える前の用意（じゅんの1分が、ちゃんと合否になるか）
      ready,
      // どの数え始めと比べているのか（棚の名前と日付だけ・金額は出さない）
      openingSource,
    });
  } catch (e: any) {
    return json({ ok: false, reason: String(e?.message ?? e).slice(0, 120) });
  }
}

/**
 * 手羽屋が毎日使う現金の画面（/cash）が読む棚の「数え始めの日」だけを読む。
 * **読むだけ**で、金額（期首残高）は読みません。読めなかったら「無い」ではなく
 * 日付なしとして扱います（0件と取り違えないため）。
 */
async function readDailyScreenOpening(
  db: ReturnType<typeof serverClient>,
): Promise<{ otherOpeningDate: string | null; otherShelfExists: boolean }> {
  try {
    const { data, error } = await db
      .from("cash_settings")
      .select("start_date")
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error) return { otherOpeningDate: null, otherShelfExists: false };
    const row = (data as Array<{ start_date?: unknown }> | null)?.[0] ?? null;
    if (!row) return { otherOpeningDate: null, otherShelfExists: false };
    const d = row.start_date;
    return {
      otherOpeningDate: typeof d === "string" && d ? d : null,
      otherShelfExists: true,
    };
  } catch {
    return { otherOpeningDate: null, otherShelfExists: false };
  }
}

/** 今日（YYYY-MM-DD・日本時間） */
function todayStr(d: Date): string {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function json(body: Record<string, unknown>) {
  return NextResponse.json(stampCheckWindow(body), {
    status: 200,
    headers: CHECK_WINDOW_HEADERS,
  });
}
